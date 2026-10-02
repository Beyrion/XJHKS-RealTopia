package com.realtopia.glasses;

import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

final class RealiaFrame {
    static final int MAGIC = 0x52454131; // REA1
    static final int MAX_JPEG_BYTES = 20 * 1024 * 1024;
    static final int MAX_AUDIO_BYTES = 32 * 1024 * 1024;
    private static final byte[] EVENT_MARKER={1};
    private RealiaFrame() { }

    static void write(DataOutputStream out, long requestId, JSONObject metadata,
                      byte[] jpeg) throws IOException {
        write(out, requestId, metadata.toString(), jpeg);
    }

    static void write(DataOutputStream out, long requestId, String metadata,
                      byte[] jpeg) throws IOException {
        if (jpeg == null || jpeg.length == 0 || jpeg.length > MAX_JPEG_BYTES) {
            throw new IOException("invalid JPEG length");
        }
        writePayload(out,1,requestId,metadata,jpeg);
    }

    static void writeAudio(DataOutputStream out,long recordingId,JSONObject metadata,
                           byte[] pcm) throws IOException {
        writeAudio(out, recordingId, metadata.toString(), pcm);
    }

    static void writeAudio(DataOutputStream out, long recordingId, String metadata,
                           byte[] pcm) throws IOException {
        if (pcm == null || pcm.length == 0 || pcm.length > MAX_AUDIO_BYTES) {
            throw new IOException("invalid audio length");
        }
        writePayload(out, 2, recordingId, metadata, pcm);
    }

    static void writePersonChoice(DataOutputStream out,long eventId,JSONObject metadata)
            throws IOException {
        writePersonChoice(out,eventId,metadata.toString());
    }

    static void writePersonChoice(DataOutputStream out,long eventId,String metadata)
            throws IOException {
        writePayload(out,3,eventId,metadata,EVENT_MARKER);
    }

    private static void writePayload(DataOutputStream out,int type,long id,String metadata,
                                     byte[] payload) throws IOException {
        byte[] json = metadata.getBytes(StandardCharsets.UTF_8);
        if (json.length > 64 * 1024) throw new IOException("metadata too large");
        out.writeInt(MAGIC);
        out.writeByte(1);
        out.writeByte(type);
        out.writeShort(0);
        out.writeLong(id);
        out.writeInt(json.length);
        out.writeInt(payload.length);
        out.write(json);
        out.write(payload);
        out.flush();
    }
}
