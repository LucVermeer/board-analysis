# Mobile React Native logo assets

Author: Marco de Jongh (`marcodejongh`)

License and permission: created by Marco de Jongh for Boardsesh. Boardsesh has
permission to use, modify, reproduce, and distribute this artwork as app
branding, including installed app icons, splash screens, App Store assets,
Google Play assets, website assets, and related marketing surfaces.

Transport URL: https://imgur.com/a/ZHNzW7W
Downloaded file: https://i.imgur.com/A2BZVMu.png

The Imgur URL is only the handoff/download location. It is not the ownership or
license provenance for this artwork.

The source PNG has a dark RGB background. The transparent master removes that
background with ImageMagick by building an HSL/luminance alpha mask, then the
Expo assets in `packages/mobile/assets/` are derived from that master.

Current mask settings:

```sh
magick source-imgur-A2BZVMu.png -colorspace HSL -channel B -separate +channel \
  -threshold 17% -morphology Close Disk:24 -morphology Dilate Disk:18 \
  -morphology Close Disk:10 -blur 0x0.75 -level 40%,60% mask.png
```

`icon.png` is intentionally opaque on black for launcher/store compatibility.
`adaptive-icon.png` and `splash-icon.png` keep transparent backgrounds.
