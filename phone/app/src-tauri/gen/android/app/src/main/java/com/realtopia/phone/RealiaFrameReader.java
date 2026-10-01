package com.realtopia.phone;

import android.os.SystemClock;
import java.io.DataInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.function.LongSupplier;
import org.json.JSONException;
import org.json.JSONObject;

public final class RealiaFrameReader {
    static final int MAGIC = 0x52454131;
    static final int MAX_METADATA_BYTES = 64 * 1024;
    static final int MAX_JPEG_BYTES = 20 * 1024 * 1024;
    static final int MAX_AUDIO_BYTES = 32 * 1024 * 1024;

    public static final class Frame {
        private final long requestId, readStartedAtMs, readFinishedAtMs;
        private final int type;
        private final JSONObject metadata;
        private final byte[] jpeg;
        Frame(int type,long requestId, JSONObject metadata, byte[] jpeg,
              long readStartedAtMs, long readFinishedAtMs) {
            this.type=type;
            this.requestId = requestId;
            this.metadata = metadata;
            this.jpeg = jpeg;
            this.readStartedAtMs = readStartedAtMs;
            this.readFinishedAtMs = readFinishedAtMs;
        }
        public long requestId() { return requestId; }
        public int type(){return type;}
        public boolean isPhoto(){return type==1;}
        public boolean isAudio(){return type==2;}
        public JSONObject metadata() { return metadata; }
        public byte[] jpeg() { return jpeg; }
        public long readStartedAtMs() { return readStartedAtMs; }
        public long readFinishedAtMs() { return readFinishedAtMs; }
    }

    private RealiaFrameReader() { }

    static Frame read(DataInputStream input) throws IOException {
        return read(input, SystemClock::elapsedRealtime);
    }

    static Frame read(DataInputStream input, LongSupplier clock) throws IOException {
        int magic;
        try {
            magic = input.readInt();
        } catch (EOFException e) {
            throw e;
        }
        // The blocking wait for the next frame is not network transfer time.
        // Start timing once the frame magic has reached the receiver.
        long started = clock.getAsLong();
        int version = input.readUnsignedByte();
        int type = input.readUnsignedByte();
        input.readUnsignedShort();
        long requestId = input.readLong();
        int metadataLength = input.readInt();
        int jpegLength = input.readInt();
        if (magic != MAGIC || version != 1 || (type != 1 && type != 2)) {
            throw new IOException("unsupported REA/1 frame");
        }
        if (metadataLength < 2 || metadataLength > MAX_METADATA_BYTES) {
            throw new IOException("invalid metadata length " + metadataLength);
        }
        int maximum=type==1?MAX_JPEG_BYTES:MAX_AUDIO_BYTES;
        if (jpegLength < 1 || jpegLength > maximum) {
            throw new IOException("invalid payload length " + jpegLength);
        }
        byte[] metadataBytes = new byte[metadataLength];
        byte[] jpeg = new byte[jpegLength];
        input.readFully(metadataBytes);
        input.readFully(jpeg);
        if (type==1 && ((jpeg[0] & 0xff) != 0xff || (jpeg[1] & 0xff) != 0xd8)) {
            throw new IOException("invalid JPEG SOI");
        }
        try {
            JSONObject metadata = new JSONObject(
                    new String(metadataBytes, StandardCharsets.UTF_8));
            return new Frame(type,requestId, metadata, jpeg, started,
                    clock.getAsLong());
        } catch (JSONException e) {
            throw new IOException("invalid metadata JSON", e);
        }
    }
}
