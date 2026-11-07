These synthetic, three-second, 32×32 H.264 fixtures contain no personal media.
The chapter metadata uses the millisecond FFmetadata format written by
[LosslessCut](https://github.com/mifi/lossless-cut/blob/master/src/renderer/src/hooks/useFfmpegOperations.ts).

From this directory, generate the files with FFmpeg:

```sh
ffmpeg -f lavfi -i color=size=32x32:rate=2:duration=3 -c:v libx264 -pix_fmt yuv420p no-chapters.mp4
ffmpeg -i no-chapters.mp4 -i chapters.ffmetadata -map 0:v -map_metadata 1 -map_chapters 1 -c copy chapters.mp4
ffmpeg -i no-chapters.mp4 -i chapters.ffmetadata -map 0:v -map_metadata 1 -map_chapters 1 -c copy -movflags disable_chpl quicktime.mov
ffmpeg -i no-chapters.mp4 -i chapters.ffmetadata -map 0:v -map_metadata 1 -map_chapters 1 -c copy chapters.mkv
python3 -c "from pathlib import Path; Path('nero.mp4').write_bytes(Path('chapters.mp4').read_bytes().replace(b'chap', b'free'))"
```

`chapters.mp4` has both QuickTime chapter tracks and a Nero `chpl` atom.
`quicktime.mov` omits the Nero atom. `nero.mp4` disables the QuickTime chapter
track reference by replacing its `chap` atom type with `free`, leaving FFprobe
to read only Nero chapters. `chapters.mkv` has Matroska chapters. Every chaptered
fixture has a Unicode title and an untitled chapter.

Production extraction only reads the original file with FFprobe. Fixture creation
and remuxing are test-data preparation, separate from application behavior.
