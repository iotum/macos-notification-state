#import "napi.h"
#import <Foundation/Foundation.h>

// Requirements for make it work:
// 1. add entitlement <key>com.apple.developer.usernotifications.communication</key><true/>
// 2. create ProvisioningProfile (if have not yet) - allow Communication Notification service access
// 3. "NSFocusStatusUsageDescription": "some description", - in order to show Request access to FocusStatus
// note: for reset use "tccutil reset FocusStatus".

Napi::Value NoOp(const Napi::CallbackInfo &info) {
  return info.Env().Undefined();
}
Napi::Promise GetFocusStatus(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
  Napi::ThreadSafeFunction ts_fn = Napi::ThreadSafeFunction::New(
      env, Napi::Function::New(env, NoOp), "focusStatusCallback", 0, 1,
      [](Napi::Env) {});

  Class focusStatusCenterClass = NSClassFromString(@"INFocusStatusCenter");
  if (focusStatusCenterClass == Nil) {
    deferred.Reject(
        Napi::TypeError::New(env, "getFocusStatus not supported").Value());
    return deferred.Promise();
  }

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
  id defaultCenter =
      [focusStatusCenterClass performSelector:@selector(defaultCenter)];
#pragma clang diagnostic pop

  if (defaultCenter == nil ||
      ![defaultCenter
          respondsToSelector:@selector(
              requestAuthorizationWithCompletionHandler:)]) {
    deferred.Reject(
        Napi::TypeError::New(env, "getFocusStatus not supported").Value());
    return deferred.Promise();
  }

  [defaultCenter requestAuthorizationWithCompletionHandler:^(
                     NSInteger status) {
    NSNumber *isFocused = @0;

    @try {
      id focusStatus = [defaultCenter valueForKey:@"focusStatus"];
      if (focusStatus != nil) {
        id focusedValue = [focusStatus valueForKey:@"isFocused"];
        if ([focusedValue isKindOfClass:[NSNumber class]]) {
          isFocused = focusedValue;
        }
      }
    } @catch (NSException *exception) {
      NSLog(@"MacosNotificationState: failed to read focus status: %@",
            exception);
    }

    auto callback = [=](Napi::Env callbackEnv, Napi::Function noop_cb) {
      if (status == 3) {
        deferred.Resolve(
            Napi::Number::New(callbackEnv, [isFocused intValue]));
      } else {
        NSString *errorStatus = [NSString
            stringWithFormat:@"FocusStatus access not authorized, status: %ld",
                             (long)status];
        deferred.Reject(
            Napi::TypeError::New(
                callbackEnv,
                Napi::String::New(callbackEnv, [errorStatus UTF8String]))
                .Value());
      }
    };

    ts_fn.BlockingCall(callback);
  }];

  return deferred.Promise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  if (NSClassFromString(@"INFocusStatusCenter") != Nil) {
    exports.Set(Napi::String::New(env, "getFocusStatus"),
                Napi::Function::New(env, GetFocusStatus));
  }
  return exports;
}
NODE_API_MODULE(target_name, Init)
