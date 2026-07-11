# Audio Processing and Mastering

## Project Overview

Develop a web application that allows users to upload an audio file or acquire audio from a live audio input (e.g., microphone) and perform a series of audio processing operations directly in the browser. The application should provide a graphical interface for applying common mastering and signal-processing techniques, enabling users to compare the original and processed versions of the audio.

The processed audio must be visualized as a waveform and made available for playback and download. The project should leverage modern web technologies, including the Web Audio API, for audio analysis and processing.

## Required Features

### Audio Acquisition

- Upload an audio file from local storage.
- Record audio through a microphone using browser-based audio capture.
- Support common audio formats such as WAV, MP3, and OGG (where  - browser compatibility allows).

### Audio Playback

- Play, pause, stop, and seek within the original audio.
- Play back the processed audio independently.
- Provide a clear comparison between the original and processed signals.

### Audio Processing

Implement the following processing capabilities:

#### Gain Control

- Increase or decrease the overall volume of the audio signal.
- Provide a user-adjustable gain control.

#### Dynamic Range Compression

- Allow the user to apply compression.
- Expose at least threshold and ratio parameters.
- Optionally include attack and release controls.

#### Limiting

- Implement a limiter to prevent signal peaks from exceeding a specified threshold.
- Allow the threshold to be configured by the user.

#### Normalization

- Analyze the signal peak level.
- Normalize the audio to a user-selected peak value (e.g., 0 dBFS, −1 dBFS, −3 dBFS).

#### Audio Effects

Implement at least two effects selected from the following:

- Reverb
- Delay/Echo
- Equalization (EQ)
- Distortion
- Chorus
- Flanger
- Tremolo

Each effect should provide at least one adjustable parameter.

### Visualization

- Display the waveform of the original audio.
- Display the waveform of the processed audio.
- Update the visualization after processing.
- Clearly distinguish between the two waveforms.

### Export

- Render the processed audio offline.
- Allow the user to download the processed result as an audio file (preferably WAV format).

### User Interface

- Provide an intuitive and responsive interface.
- Organize controls logically according to the processing workflow.
- Display relevant information such as duration, sample rate, and peak level when available.

# Final Remarks

The application must be implemented primarily using HTML5, CSS, JavaScript, and the Web Audio API.

External libraries may be used for waveform visualization or specialized audio processing, provided that their role is clearly documented.

Students should demonstrate understanding of the underlying audio-processing concepts rather than relying exclusively on third-party solutions.

The final submission must include source code, a short technical report (2–4 pages), and instructions for running the application.
