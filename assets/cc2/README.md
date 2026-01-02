# CC2 Spritesheet

Place your CC2 spritesheet here:
assets/cc2/spritesheet.png

This image was downloaded from
https://steamcommunity.com/sharedfiles/filedetails/?id=448351893

Renderer behavior:

- Treats the spritesheet as a grid of 32x32 tiles.
- Uses the pixel at (0,0) as a chroma key; every pixel matching that RGBA is made transparent.

CLI usage:
npm exec -- c2mtools render <file-or-dir> --tileset assets/cc2/spritesheet.png
