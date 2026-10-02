package com.realtopia.glasses;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.ByteArrayInputStream;
import org.junit.Test;

public class RealiaFrameTest {
    @Test public void writesDocumentedBigEndianFrame() throws Exception {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        RealiaFrame.write(new DataOutputStream(bytes),42,"{\"cold\":true}",new byte[]{(byte)0xff,(byte)0xd8,(byte)0xff});
        DataInputStream in=new DataInputStream(new ByteArrayInputStream(bytes.toByteArray()));
        assertEquals(RealiaFrame.MAGIC,in.readInt());assertEquals(1,in.readUnsignedByte());assertEquals(1,in.readUnsignedByte());assertEquals(0,in.readUnsignedShort());assertEquals(42,in.readLong());
        int metadataLength=in.readInt();assertEquals(3,in.readInt());byte[] metadata=new byte[metadataLength];in.readFully(metadata);byte[] jpeg=new byte[3];in.readFully(jpeg);assertArrayEquals(new byte[]{(byte)0xff,(byte)0xd8,(byte)0xff},jpeg);
    }
    @Test public void writesPcmAudioAsTypeTwo() throws Exception {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        RealiaFrame.writeAudio(new DataOutputStream(bytes),91,"{\"sampleRate\":16000}",new byte[]{1,2,3,4});
        DataInputStream in=new DataInputStream(new ByteArrayInputStream(bytes.toByteArray()));
        assertEquals(RealiaFrame.MAGIC,in.readInt());assertEquals(1,in.readUnsignedByte());assertEquals(2,in.readUnsignedByte());in.readUnsignedShort();assertEquals(91,in.readLong());
        int metadataLength=in.readInt();assertEquals(4,in.readInt());byte[] metadata=new byte[metadataLength];in.readFully(metadata);byte[] pcm=new byte[4];in.readFully(pcm);assertArrayEquals(new byte[]{1,2,3,4},pcm);
    }
    @Test public void writesPersonChoiceAsTypeThree() throws Exception {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        RealiaFrame.writePersonChoice(new DataOutputStream(bytes),123,"{\"personId\":\"lin\",\"choiceId\":\"catch_up\"}");
        DataInputStream in=new DataInputStream(new ByteArrayInputStream(bytes.toByteArray()));
        assertEquals(RealiaFrame.MAGIC,in.readInt());assertEquals(1,in.readUnsignedByte());assertEquals(3,in.readUnsignedByte());in.readUnsignedShort();assertEquals(123,in.readLong());
        int metadataLength=in.readInt();assertEquals(1,in.readInt());byte[] metadata=new byte[metadataLength];in.readFully(metadata);assertEquals(1,in.readUnsignedByte());
        String json=new String(metadata,java.nio.charset.StandardCharsets.UTF_8);assertEquals(true,json.contains("\"choiceId\":\"catch_up\""));
    }
}
