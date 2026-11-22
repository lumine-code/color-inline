const timers = require("node:timers");
const { Task } = require("lumine");

// This task owns regexp execution. The renderer retains contributed handlers
// and can acknowledge the consumed prefix of each packet or terminate a scan.
module.exports = class CandidateScanner {
  constructor() {
    this.queue = [];
  }

  scan(snapshot, { source, maximumAnalysisLength, signal }, consume) {
    if (this.disposed || signal?.aborted || lumine.unloading) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const job = { snapshot, source, maximumAnalysisLength, signal, consume, resolve, reject };
      job.abort = () => {
        if (this.active === job) this.finish(job, null);
        else {
          const index = this.queue.indexOf(job);
          if (index === -1) return;
          this.queue.splice(index, 1);
          signal.removeEventListener("abort", job.abort);
          resolve(null);
        }
      };
      signal?.addEventListener("abort", job.abort, { once: true });
      this.queue.push(job);
      this.runNext();
    });
  }

  runNext() {
    if (this.disposed || this.active) return;
    const job = this.queue.shift();
    if (!job) {
      if (this.worker && !this.idleTimer)
        this.idleTimer = timers.setTimeout(() => this.terminateWorker(), 5000);
      return;
    }
    timers.clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.active = job;
    try {
      const task = (this.worker ??= new Task(require.resolve("./candidate-worker")));
      const fail = (error) => this.finish(job, null, error.name === "AbortError" ? null : error);
      const exit = (code, signal) =>
        fail(new Error(`Color candidate worker exited (${signal ?? code}).`));
      const packets = task.on("color-inline:candidate-packet", (packet) => {
        if (this.active !== job) return;
        try {
          const next =
            packet.kind === "source"
              ? job.snapshot.slice(packet.offset, packet.offset + packet.size)
              : job.consume(packet);
          if (this.active === job)
            task.send({ event: "color-inline:candidate-reply", args: [next] });
        } catch (error) {
          fail(error);
        }
      });
      const errors = task.on("task:error", (message) => fail(new Error(message)));
      const child = task.childProcess;
      job.cleanup = () => {
        packets.dispose();
        errors.dispose();
        child?.removeListener("exit", exit);
        child?.removeListener("error", fail);
      };
      if (!child) {
        this.finish(job, null);
        return;
      }
      task.start(
        {
          length: job.snapshot.length,
          source: job.source,
          maximumAnalysisLength: job.maximumAnalysisLength,
        },
        (result) => {
          if (!result?.done)
            fail(
              Object.assign(new Error(result?.error ?? "Color candidate scan did not finish"), {
                code: result?.code,
              }),
            );
          else this.finish(job, true);
        },
      );
      child.once("exit", exit);
      child.once("error", fail);
    } catch (error) {
      this.finish(job, null, error);
    }
  }

  finish(job, result, error) {
    if (this.active !== job) return;
    job.signal?.removeEventListener("abort", job.abort);
    job.cleanup?.();
    this.active = null;
    if (result === null) this.terminateWorker();
    if (error) job.reject(error);
    else job.resolve(result);
    this.runNext();
  }

  terminateWorker() {
    timers.clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.worker?.terminate();
    this.worker = null;
  }

  dispose() {
    this.disposed = true;
    for (const job of this.queue.splice(0)) {
      job.signal?.removeEventListener("abort", job.abort);
      job.resolve(null);
    }
    if (this.active) this.finish(this.active, null);
    else this.terminateWorker();
  }
};
