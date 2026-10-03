package com.realtopia.glasses;

import org.junit.Test;
import static org.junit.Assert.*;

public class ActiveCaptureLoopTest {
    private static final class Fake implements ActiveCaptureLoop.Scheduler, ActiveCaptureLoop.Target {
        Runnable pending, finished;
        long delay;
        boolean ready = true;
        int captures;
        public void postDelayed(Runnable task, long ms) { pending=task;delay=ms; }
        public void remove(Runnable task) { if(pending==task)pending=null; }
        public boolean isReady() { return ready; }
        public void capture(Runnable done) { captures++;finished=done; }
        void tick() { Runnable task=pending;pending=null;if(task!=null)task.run(); }
    }
    @Test public void defaultOffAndFirstShotIsImmediateThenEveryTenSeconds() {
        Fake fake=new Fake();ActiveCaptureLoop loop=new ActiveCaptureLoop(fake,fake);
        assertNull(fake.pending);
        loop.setEnabled(true);
        assertEquals(0,fake.delay);assertEquals(0,fake.captures);
        fake.tick();assertEquals(1,fake.captures);assertEquals(10_000,fake.delay);
        fake.finished.run();fake.tick();assertEquals(2,fake.captures);
    }
    @Test public void disconnectedSkipsAndBusyDoesNotOverlap() {
        Fake fake=new Fake();ActiveCaptureLoop loop=new ActiveCaptureLoop(fake,fake);
        fake.ready=false;loop.setEnabled(true);fake.tick();assertEquals(0,fake.captures);
        assertEquals(ActiveCaptureLoop.FIRST_SHOT_RETRY_MS,fake.delay);
        fake.ready=true;fake.tick();fake.tick();assertEquals(1,fake.captures);
        fake.finished.run();fake.tick();assertEquals(2,fake.captures);
    }
    @Test public void stopCancelsAndStaleCompletionCannotUnlockNewCapture() {
        Fake fake=new Fake();ActiveCaptureLoop loop=new ActiveCaptureLoop(fake,fake);
        loop.setEnabled(true);fake.tick();Runnable old=fake.finished;
        loop.setEnabled(false);assertNull(fake.pending);fake.tick();assertEquals(1,fake.captures);
        loop.setEnabled(true);fake.tick();old.run();fake.tick();assertEquals(2,fake.captures);
        fake.finished.run();fake.tick();assertEquals(3,fake.captures);
        loop.close();assertNull(fake.pending);
    }
    @Test public void duplicateEnableDoesNotResetTimer() {
        Fake fake=new Fake();ActiveCaptureLoop loop=new ActiveCaptureLoop(fake,fake);
        loop.setEnabled(true);Runnable pending=fake.pending;
        loop.setEnabled(true);assertSame(pending,fake.pending);
        fake.tick();assertEquals(1,fake.captures);
        fake.finished.run();pending=fake.pending;
        loop.setEnabled(true);assertSame(pending,fake.pending);
        assertEquals(10_000,fake.delay);assertEquals(1,fake.captures);
    }
    @Test public void stopBeforeImmediateShotDoesNotCapture() {
        Fake fake=new Fake();ActiveCaptureLoop loop=new ActiveCaptureLoop(fake,fake);
        loop.setEnabled(true);assertEquals(0,fake.delay);
        loop.setEnabled(false);fake.tick();assertEquals(0,fake.captures);
        loop.setEnabled(true);assertEquals(0,fake.delay);
        fake.tick();assertEquals(1,fake.captures);
    }
    @Test public void stopWhileWaitingForConnectionCancelsFirstShot() {
        Fake fake=new Fake();ActiveCaptureLoop loop=new ActiveCaptureLoop(fake,fake);
        fake.ready=false;loop.setEnabled(true);fake.tick();fake.tick();
        assertEquals(0,fake.captures);assertEquals(ActiveCaptureLoop.FIRST_SHOT_RETRY_MS,fake.delay);
        loop.close();fake.ready=true;fake.tick();assertEquals(0,fake.captures);assertNull(fake.pending);
    }
    @Test public void disconnectAfterFirstShotRetainsTenSecondCadence() {
        Fake fake=new Fake();ActiveCaptureLoop loop=new ActiveCaptureLoop(fake,fake);
        loop.setEnabled(true);fake.tick();fake.finished.run();
        fake.ready=false;fake.tick();assertEquals(10_000,fake.delay);
        fake.ready=true;fake.tick();assertEquals(2,fake.captures);assertEquals(10_000,fake.delay);
    }
    @Test public void failedFirstShotClearsBusyAndDoesNotRetryInBurst() {
        Fake fake=new Fake();ActiveCaptureLoop loop=new ActiveCaptureLoop(fake,new ActiveCaptureLoop.Target(){
            public boolean isReady(){return true;}
            public void capture(Runnable done){fake.captures++;throw new IllegalStateException("fixture failure");}
        });
        loop.setEnabled(true);
        for(int i=1;i<=2;i++){
            try{fake.tick();fail("expected fixture failure");}catch(IllegalStateException expected){}
            assertEquals(i,fake.captures);assertEquals(10_000,fake.delay);
        }
    }
}
