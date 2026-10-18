# Street food kit v2

Built-in imagegen edit of street-food-kit-v1.png, requested to correct projection and common scale. First-pass art; exact geometry still needs runtime calibration.

## Final prompt

Edit the supplied asset sheet. Keep exactly the same nine objects, their arrangement, materials, colors, cart equipment, fully roofless cart structures and transparent background. Correct ONLY the camera projection, relative scale, and crisp sprite finish for a strict 2:1 game isometric result (the user calls this 1:2 height:width).

Mandatory geometric correction: use an orthographic camera at elevation 30 degrees and azimuth 45 degrees. Every ground-aligned rectangular top is a parallelogram whose edges run exactly plus/minus 26.565 degrees from horizontal, with no perspective convergence. Both axes use equal foreshortening. ALL three carts must share this identical camera and orientation. The exposed circular surfaces of both unfolded round tables must be unmistakable ellipses EXACTLY twice as wide as tall, not the flatter approximately 2.5:1 ellipses in the input. The straight vertical sides remain vertical. Square stool tops are ground-parallel diamonds with diagonal width twice diagonal height. Do not show front-on circular horizontal tabletops.

Maintain an actual common scale across objects: carts about 2m long, tabletop diameter about 1m, stool width 0.4m. Relative projected cart counter height 0.9m, table height0.72m, stool0.45m. The two tables should be smaller than in the reference relative to the carts. Small stools can sit in generous empty transparent cells. Keep all objects separate with ample gutters and no overlap. Nine sprites reading order unchanged: three carts; cream table, mint table, open red folding stool; open green folding stool, folded round table standing on rim, stack of folded stools.

Style: clean finely crafted isometric game sprites with crisper clustered pixel-like edges and slightly simpler shading than the input, no photorealistic depth of field, no perspective camera. Soft contact darkening stays within each object. Genuine transparent alpha throughout the surrounding gutters and all holes in legs/handles. No ground, no baked backdrop or colored vignette, no captions, no text, no extra items, no people, no roofs. Preserve nostalgic Hong Kong practical handcart character.
