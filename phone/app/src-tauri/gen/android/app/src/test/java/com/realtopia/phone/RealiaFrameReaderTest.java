package com.realtopia.phone;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Test;

public class RealiaFrameReaderTest {
    @Test public void readsGoldenRea1Frame() throws Exception {
        byte[] metadata = "{\"width\":4032,\"height\":3024}".getBytes(StandardCharsets.UTF_8);
        byte[] jpeg = new byte[]{(byte) 0xff, (byte) 0xd8, (byte) 0xff, 1, 2};
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(bytes);
        out.writeInt(RealiaFrameReader.MAGIC);
        out.writeByte(1);
        out.writeByte(1);
        out.writeShort(0);
        out.writeLong(42L);
        out.writeInt(metadata.length);
        out.writeInt(jpeg.length);
        out.write(metadata);
        out.write(jpeg);
        AtomicLong clock = new AtomicLong(100);

        RealiaFrameReader.Frame frame = RealiaFrameReader.read(
                new DataInputStream(new ByteArrayInputStream(bytes.toByteArray())),
                () -> clock.getAndAdd(12));

        assertEquals(42L, frame.requestId());
        assertEquals(4032, frame.metadata().getInt("width"));
        assertArrayEquals(jpeg, frame.jpeg());
        assertEquals(12L, frame.readFinishedAtMs() - frame.readStartedAtMs());
    }
    @Test public void readsPcmAudioFrameWithoutJpegMarker() throws Exception {
        byte[] metadata="{\"sampleRate\":16000}".getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(bytes);
        out.writeInt(RealiaFrameReader.MAGIC);out.writeByte(1);out.writeByte(2);out.writeShort(0);out.writeLong(91);out.writeInt(metadata.length);out.writeInt(4);out.write(metadata);out.write(new byte[]{1,2,3,4});
        RealiaFrameReader.Frame frame=RealiaFrameReader.read(new DataInputStream(new ByteArrayInputStream(bytes.toByteArray())),()->100L);
        assertEquals(2,frame.type());assertEquals(true,frame.isAudio());assertEquals(16000,frame.metadata().getInt("sampleRate"));assertArrayEquals(new byte[]{1,2,3,4},frame.jpeg());
    }
    @Test public void readsPersonChoiceEventFrame() throws Exception {
        byte[] metadata="{\"personId\":\"lin\",\"choiceIndex\":1,\"choiceId\":\"catch_up\",\"label\":\"聊聊近况\"}".getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(bytes);
        out.writeInt(RealiaFrameReader.MAGIC);out.writeByte(1);out.writeByte(3);out.writeShort(0);out.writeLong(123);out.writeInt(metadata.length);out.writeInt(1);out.write(metadata);out.writeByte(1);
        RealiaFrameReader.Frame frame=RealiaFrameReader.read(new DataInputStream(new ByteArrayInputStream(bytes.toByteArray())),()->100L);
        assertEquals(true,frame.isPersonChoice());assertEquals(123,frame.requestId());assertEquals("lin",frame.metadata().getString("personId"));assertEquals("catch_up",frame.metadata().getString("choiceId"));
    }
}
