# CutByCut

A free all-in-one editor for Windows: video, audio and photo in a single app. No subscription and no watermark.

Built with Electron and FFmpeg.

## Features

**Video editor**
- Multi-track timeline with text, stickers, effects, transitions, filters and color correction
- Keyframes, masks, chroma key, speed control and freeze frames
- Automatic captions (Whisper) and background removal
- Background export to MP4 (H.264 or H.265) or GIF, with GPU encoding when available

**Audio editor**
- Multi-track editing with waveforms, a live spectrum and voice recording
- Volume, fades and speed for each clip
- Export to MP3, WAV, FLAC, M4A or OGG, with optional loudness normalization

**Photo editor**
- Layers with drag-and-drop ordering, on a canvas of any size
- Text, stickers, filters, masks and cropping
- Export to PNG, JPG or WEBP, including transparent backgrounds

**Make it yours**
- Drag panels and toolbar buttons anywhere in the interface editor (`Ctrl+Shift+L`)
- Save your own layouts, separately for each editor
- Change themes, colors, fonts, spacing, corner radius and animation speed

**Keep your projects portable**
- Collect a project and all its media into one folder
- Find missing files by pointing the app at a folder
- Export the edit as FCPXML and captions as SRT

## Getting started

You need [Node.js](https://nodejs.org) and FFmpeg:

```
winget install Gyan.FFmpeg
git clone https://github.com/ilkatds/cutbycut.git
cd cutbycut
npm install
npm start
```

To build a Windows app, run `npm run pack`.

Automatic captions and local background removal also need Python with `openai-whisper` and `rembg`.

## Language

The interface is written in Russian and has translations for English, Ukrainian, Polish, German, Spanish, French, Italian, Portuguese and Turkish. To switch language, open Settings → General. The newest parts of the interface are not translated yet.

## API keys

This repository contains no API keys. Keys for optional services (Pixabay, Pexels, Freesound, remove.bg) are entered in the app's settings and stored only on your computer.
