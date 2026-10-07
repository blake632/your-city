# The marketing video

A 104-second phone video (1080 x 1920) of the 3D city. It taps into each building to show how that department works.
It uses Sam's Kitchens, a made-up business. The AI, Gmail and GitHub are stand-ins, so nothing real is shown.

## Make it on a Mac

You need Node 22 and ffmpeg. Run each line in Terminal, one at a time.

Go to the app folder:

```
cd your-city
```

Install the app:

```
npm install
```

Install the robot browser:

```
npm install --no-save playwright && npx playwright install chromium
```

Install ffmpeg (needs Homebrew):

```
brew install ffmpeg
```

Make the video:

```
node video/v3d.js
```

It lands in `video/vout/your-city.mp4`.

To check a few moments first (pictures in `video/shots`):

```
node video/v3d.js stills 2 9 20 45
```

## The files

- `vdirector.js`: the camera path, the captions and what each agent says, by the second.
- `vsample.js`: the sample city, run through the real app.
- `v3d.js`: draws every frame and joins them into the MP4.
