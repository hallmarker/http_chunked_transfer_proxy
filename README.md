# HTTP Chunked Transfer Proxy
The HTTP Chunked Transfer Proxy can be used to proxy Chunked CMAF content from an encoder to an origin or directly to a ULL-CMAF compatible player.

This proxy is not indented for producation usage. The purpose is to test and evaulate how ULL-CMAF players behaves in a multi-ABR content setup.

## Install
    npm install

## Start the proxy
    node index.js

- Default input address (where to post MP4 segments and manifest) is http://127.0.0.1:9090
- Default output address (where to access the chunked segments) is http://127.0.0.1:9191

## Sample content
FFmpeg can be used to loop ABR encoded MP4 files and create a Chunked HTTP Transfer stream that can be used as a source to the proxy.

Below is an example how to loop three mp4 files called 450.mp4, 900.mp4 and 2000.mp4 and produce a chunked CMAF stream and put segments to the proxy via http://localhost:9090.

```
ffmpeg \
-re -stream_loop -1 -probesize 100000 -i 450.mp4 \
-re -stream_loop -1 -probesize 100000 -i 900.mp4 \
-re -stream_loop -1 -probesize 100000 -i 2000.mp4 \
-loglevel verbose \
-map 0:0 -map 0:1 -map 1:0 -map 2:0 -c:v copy -c:a copy \
-seg_duration 4 -window_size 4 -extra_window_size 50 -remove_at_exit 0 -use_template 1 -use_timeline 0 -single_file 0 -init_seg_name "init-stream\$RepresentationID\$.mp4" -media_seg_name "chunk-stream\$RepresentationID\$-\$Number%05d\$-$(date -u +%Y%m%dT%H%M).m4s" -utc_timing_url "http://127.0.0.1:9191/utc" -method PUT -hls_playlist 1 -streaming 1 -adaptation_sets 'id=0,streams=v id=1,streams=a' -dash_segment_type mp4 -loglevel verbose -f dash http://127.0.0.1:9090/manifest.mpd
```

## Sample player
dash.js v3.0.0 can be used to test playback of Chunked CMAF content. Make sure to set setLowLatencyEnabled(true) and setLiveDelay(DELAY) to the dashjs.MediaPlayer() instance to fully utilize the low-latency features.

## NGINX frontend
The Chunked HTTP Proxy can be used with NGINX as a serving frontend. Below is an example how NGINX can be configured.

```
location / {
    # Proxy basic settings
        proxy_pass http://127.0.0.1:9191;
        proxy_http_version 1.1;
        chunked_transfer_encoding on;
    # Proxy buffering
        proxy_buffering on;
        proxy_buffer_size 8k;
        proxy_buffers 8 8k;
        proxy_max_temp_file_size 1024m;
    # Client request settings
        client_max_body_size 100M;
        proxy_request_buffering off;
    # Cache directives
        add_header Cache-Control public;
        expires 2s;
}
```
