/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.thingsboard.server.service.video;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

public interface VideoProvider {

    String providerType();

    List<VideoCameraInfo> listCameras();

    VideoCameraInfo describe(VideoCameraBinding binding);

    VideoPlaybackInfo startPlayback(VideoCameraBinding binding, VideoPlayRequest request);

    VideoProviderStatus getStatus(VideoCameraBinding binding);

    void stopPlayback(VideoCameraBinding binding);

    VideoSnapshot getSnapshot(VideoCameraBinding binding);

    default VideoPtzResult controlPtz(VideoCameraBinding binding, VideoPtzRequest request) {
        throw unsupported("PTZ");
    }

    default VideoRecordingList listRecordings(VideoCameraBinding binding, VideoRecordingQuery query) {
        throw unsupported("recording query");
    }

    default VideoRecordingPlaybackSource startRecordingPlayback(
            VideoCameraBinding binding,
            VideoRecordingPlayRequest request) {
        throw unsupported("recording playback");
    }

    default void stopRecordingPlayback(VideoCameraBinding binding, String providerStreamId) {
        throw unsupported("recording playback stop");
    }

    default void controlRecordingPlayback(
            VideoCameraBinding binding,
            String providerStreamId,
            VideoRecordingControlRequest request) {
        throw unsupported("recording playback control");
    }

    private ResponseStatusException unsupported(String capability) {
        return new ResponseStatusException(
                HttpStatus.NOT_IMPLEMENTED,
                "Video provider " + providerType() + " does not support " + capability);
    }

}
