/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.video;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.thingsboard.rule.engine.api.TimeseriesSaveRequest;
import org.thingsboard.server.common.data.id.DeviceId;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.common.data.kv.BasicTsKvEntry;
import org.thingsboard.server.common.data.kv.BooleanDataEntry;
import org.thingsboard.server.common.data.kv.LongDataEntry;
import org.thingsboard.server.common.data.kv.StringDataEntry;
import org.thingsboard.server.common.data.kv.TsKvEntry;
import org.thingsboard.server.queue.util.TbCoreComponent;
import org.thingsboard.server.service.telemetry.InternalTelemetryService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@TbCoreComponent
public class VideoZlmHookService {

    private final VideoCameraBindingRepository bindingRepository;
    private final InternalTelemetryService telemetryService;
    private final Map<StreamKey, StreamState> states = new ConcurrentHashMap<>();

    public VideoZlmHookService(
            VideoCameraBindingRepository bindingRepository,
            InternalTelemetryService telemetryService) {
        this.bindingRepository = bindingRepository;
        this.telemetryService = telemetryService;
    }

    public Map<String, Object> handle(String rawEvent, JsonNode body) {
        String event = normalizeEvent(rawEvent);
        JsonNode payload = body == null ? com.fasterxml.jackson.databind.node.MissingNode.getInstance() : body;
        String app = text(payload, "app");
        String stream = text(payload, "stream");
        String mediaServerId = text(payload, "mediaServerId");

        if (!app.isBlank() && !stream.isBlank()) {
            StreamKey key = new StreamKey(mediaServerId, app, stream);
            StreamState state = states.computeIfAbsent(key, ignored -> new StreamState());
            synchronized (state) {
                applyEvent(event, payload, state);
                state.updatedAt = System.currentTimeMillis();
                syncBindings(key, state);
            }
        }

        if ("on_stream_none_reader".equals(event)) {
            return Map.of("code", 0, "msg", "success", "close", false);
        }
        return Map.of("code", 0, "msg", "success");
    }

    private void applyEvent(String event, JsonNode payload, StreamState state) {
        switch (event) {
            case "on_stream_changed" -> {
                String schema = text(payload, "schema");
                if (schema.isBlank()) {
                    schema = "unknown";
                }
                if (payload.path("regist").asBoolean(false)) {
                    state.schemas.add(schema);
                    state.online = true;
                } else {
                    state.schemas.remove(schema);
                    state.online = !state.schemas.isEmpty();
                    if (!state.online) {
                        state.readerCount = 0;
                    }
                }
                state.readerCount = readerCount(payload, state.readerCount);
            }
            case "on_stream_none_reader" -> state.readerCount = 0;
            case "on_play" -> state.readerCount = readerCount(payload, state.readerCount);
            case "on_record_start" -> state.recording = true;
            case "on_record_stop", "on_record_mp4", "on_record_ts" -> {
                state.recording = false;
                state.lastRecordingAt = System.currentTimeMillis();
            }
            default -> state.readerCount = readerCount(payload, state.readerCount);
        }
    }

    private void syncBindings(StreamKey key, StreamState state) {
        List<VideoCameraBinding> bindings = bindingRepository.findAllByStream(
                key.app(),
                key.stream(),
                key.mediaServerId().isBlank() ? null : key.mediaServerId());
        for (VideoCameraBinding binding : bindings) {
            long ts = state.updatedAt;
            List<TsKvEntry> entries = new ArrayList<>();
            entries.add(new BasicTsKvEntry(ts, new BooleanDataEntry("streamOnline", state.online)));
            entries.add(new BasicTsKvEntry(ts, new BooleanDataEntry("videoLoss", !state.online)));
            entries.add(new BasicTsKvEntry(ts, new LongDataEntry("readerCount", (long) state.readerCount)));
            entries.add(new BasicTsKvEntry(ts, new BooleanDataEntry("recording", state.recording)));
            entries.add(new BasicTsKvEntry(ts, new LongDataEntry("videoHookUpdatedAt", ts)));
            entries.add(new BasicTsKvEntry(ts, new StringDataEntry(
                    "videoStreamStatus",
                    state.online ? VideoStreamStatus.READY.name().toLowerCase(Locale.ROOT)
                            : VideoStreamStatus.OFFLINE.name().toLowerCase(Locale.ROOT))));
            if (state.lastRecordingAt > 0) {
                entries.add(new BasicTsKvEntry(ts, new LongDataEntry("lastRecordingAt", state.lastRecordingAt)));
            }
            telemetryService.saveTimeseriesInternal(TimeseriesSaveRequest.builder()
                    .tenantId(new TenantId(binding.tenantId()))
                    .entityId(new DeviceId(binding.tbDeviceId()))
                    .entries(entries)
                    .ttl(0)
                    .strategy(new TimeseriesSaveRequest.Strategy(true, true, true, false))
                    .build());
        }
    }

    private static int readerCount(JsonNode payload, int defaultValue) {
        if (payload.has("totalReaderCount")) {
            return Math.max(0, payload.path("totalReaderCount").asInt(defaultValue));
        }
        if (payload.has("readerCount")) {
            return Math.max(0, payload.path("readerCount").asInt(defaultValue));
        }
        return defaultValue;
    }

    private static String normalizeEvent(String rawEvent) {
        if (rawEvent == null) {
            return "";
        }
        String event = rawEvent.trim().toLowerCase(Locale.ROOT);
        int slash = event.lastIndexOf('/');
        return slash >= 0 ? event.substring(slash + 1) : event;
    }

    private static String text(JsonNode body, String field) {
        return body.path(field).asText("").trim();
    }

    private record StreamKey(String mediaServerId, String app, String stream) {

        private StreamKey {
            mediaServerId = mediaServerId == null ? "" : mediaServerId;
        }
    }

    private static final class StreamState {

        private final Set<String> schemas = new HashSet<>();
        private boolean online;
        private int readerCount;
        private boolean recording;
        private long lastRecordingAt;
        private long updatedAt;
    }
}
