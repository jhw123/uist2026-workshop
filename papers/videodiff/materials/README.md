# VideoDiff materials

Two short narrated videos and their transcripts. The paper transcribes each uploaded video with the Whisper API, which needs a key. Running Whisper yourself means a large download, so the transcripts are made for you. The videos are openly licensed and of the same kind as the paper's: one person talking over real camera footage, with few edits.

## What is here

- `videos/pheasant-howto.mp4`: a how-to cooking video. A chef breaks down a pheasant, explains how to make stock, and pan sears the breast. 4 min 58 s, H.264 MP4, 854x480, 18 MB.
- `videos/cinema-museum-tour.mp4`: a tour video. A volunteer walks through the Cinema Museum in London and talks about Charlie Chaplin, old projectors, usherette uniforms, posters and early sound equipment. 4 min 28 s, H.264 MP4, 854x480, 18 MB. The first 12 seconds are a logo with no speech.
- `transcripts/pheasant-howto.json` and `transcripts/cinema-museum-tour.json`: the transcript of each video in the JSON shape that Whisper produces. It has the full `text`, and a list of `segments`, each with `start`, `end`, `text` and a list of `words` with their own `start` and `end` times in seconds.
- `transcripts/pheasant-howto.srt` and `transcripts/cinema-museum-tour.srt`: the same transcripts as SRT subtitle files, one cue per segment.
- `broll/`: a small B-roll library standing in for the paper's stock media search: 39 openly licensed photos, illustrations and 6-second video clips that match what the two narrators talk about (pheasant, celery, stock pot, cast iron skillet, and projectors, cinema seats, usherettes, Charlie Chaplin). `broll/index.json` lists every item with its file, `type` (`photo`, `illustration` or `video`, the paper's media types), the `video` it suits, its `keywords`, and its source, credit and license. Search it by keyword the way the paper searches a stock API. The paper's system searched a live stock service, which needs an API key you do not have.

## Sources and licenses

Videos. Both were cut and re-encoded by us. We cut each one at the end of a sentence to bring it under 5 minutes.

- `pheasant-howto.mp4`: "PHEASANT 101 - how to cook pheasant with The Sporting Chef" by The Sporting Chef. Licensed CC BY 3.0 (the YouTube page says "Creative Commons Attribution license (reuse allowed)"). Commons copy: https://commons.wikimedia.org/wiki/File:PHEASANT_101_-_how_to_cook_pheasant_with_The_Sporting_Chef.webm. Original: https://www.youtube.com/watch?v=c7Se3_u0oqg. We kept the first 4:58 of the 6:38 original. It ends after "Nothing bad's going to happen." and leaves out the plating at the end. The chef names two product brands in passing.
- `cinema-museum-tour.mp4`: "At the Cinema Museum - Wikimedia UK" by Jwslubbock, with Jon Davies as the guide. Licensed CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:At_the_Cinema_Museum_-_Wikimedia_UK.webm. We kept the first 4:28 of the 7:01 original. It ends after "it wasn't a system that lasted too long." Because the license is share alike, our cut is also under CC BY-SA 4.0.

Transcripts. We made them with the open source Whisper "small" model (through faster-whisper) with word timestamps, run on the final cut audio. We then fixed a few clear spelling mistakes by hand: "bouillon", "chukar" (twice), "pen raised", and "usherette's" and "usherettes'". Other small mistakes may remain. For example, at 3:53 the chef says something like "the B side" or "the other side", and Whisper wrote "the beef side". The transcripts follow the license of their video.

B-roll. Every item comes from Wikimedia Commons and is in the public domain or under CC0, CC BY or CC BY-SA. `broll/index.json` gives each item's source page, author and license. We resized the images to at most 800 pixels and cut the videos to 6-second clips without sound, at 360p. Items under CC BY-SA keep that license.
