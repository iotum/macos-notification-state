{
  "targets": [
    {
      "target_name": "notificationstate",
      "sources": [],
      "conditions": [
        ['OS=="mac"', {
          "sources": [
            "lib/notificationstate.cc",
            "lib/notificationstate-query.cc", 
            "lib/do-not-disturb.mm", 
            "lib/macos-version.mm",
            "lib/dnd/old-macos-dnd.mm", 
            "lib/dnd/bigsur-macos-dnd.mm", 
            "lib/dnd/monterey-macos-dnd.mm"
          ],
          "xcode_settings": {
              "ARCHS": ["x86_64", "arm64"],
              "ONLY_ACTIVE_ARCH": "NO",
              "OTHER_CFLAGS": ["-arch", "x86_64", "-arch", "arm64"],
              "OTHER_CPLUSPLUSFLAGS": ["-std=c++17", "-stdlib=libc++", "-mmacosx-version-min=10.7", "-arch", "x86_64", "-arch", "arm64"],
              "OTHER_LDFLAGS": ["-arch", "x86_64", "-arch", "arm64", "-framework", "CoreFoundation", "-framework", "CoreGraphics"]
          }
        }],
      ]
    },
    {
      "target_name": "focuscenter",
      "sources": [],
      "conditions": [
        ['OS=="mac"', {
          "sources": ["lib/focus-center.mm"],
          'include_dirs' : [ "<!@(node -p \"require('node-addon-api').include\")" ],
          'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
          "xcode_settings": {
              "ARCHS": ["x86_64", "arm64"],
              "ONLY_ACTIVE_ARCH": "NO",
              "OTHER_CFLAGS": ["-arch", "x86_64", "-arch", "arm64"],
              "OTHER_CPLUSPLUSFLAGS": ["-std=c++17", "-stdlib=libc++", "-mmacosx-version-min=10.7", "-arch", "x86_64", "-arch", "arm64"],
              "OTHER_LDFLAGS": ["-arch", "x86_64", "-arch", "arm64", "-framework", "Foundation", "-weak_framework", "Intents"]
          }
        }],
      ]
    }
  ]
}
