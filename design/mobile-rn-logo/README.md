# Mobile React Native logo assets

Source image: https://imgur.com/a/ZHNzW7W
Direct source file: https://i.imgur.com/A2BZVMu.png

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
