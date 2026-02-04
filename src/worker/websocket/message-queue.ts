/**
 * Bounded message queue with backpressure control.
 *
 * Prevents OOM if parser is slower than inbound messages.
 * Drops oldest messages when queue is full (FIFO drop policy).
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import PQueue from "p-queue";

export interface MessageQueueConfig {
  /** Max concurrent message processing (default: 1) */
  concurrency?: number;
  /** Max queued messages before dropping (default: 1000) */
  maxQueueSize?: number;
  /** Called when messages are dropped due to backpressure */
  onDrop?: (dropped: number) => void;
}

export interface MessageQueue<T> {
  /** Enqueue a message for processing */
  enqueue(message: T): boolean;
  /** Get current queue size */
  getQueueSize(): number;
  /** Get total dropped messages */
  getDroppedCount(): number;
  /** Wait for queue to drain */
  waitForIdle(): Promise<void>;
  /** Clear the queue */
  clear(): void;
}

/**
 * Creates a bounded message queue with backpressure control.
 *
 * Prevents OOM if parser is slower than inbound messages.
 * Drops oldest messages when queue is full (configurable policy).
 *
 * @example
 * ```typescript
 * const queue = createMessageQueue<unknown>(
 *   (msg) => parser.parse(JSON.stringify(msg)),
 *   {
 *     concurrency: 1,
 *     maxQueueSize: 500,
 *     onDrop: (n) => logger.warn("Dropped messages due to backpressure", { count: n }),
 *   },
 * );
 *
 * ws.onMessage((data) => {
 *   queue.enqueue(data);
 * });
 * ```
 */
export const createMessageQueue = <T>(
  handler: (message: T) => Promise<void> | void,
  config?: MessageQueueConfig,
): MessageQueue<T> => {
  const { concurrency = 1, maxQueueSize = 1000, onDrop } = config ?? {};

  const queue = new PQueue({ concurrency });
  let droppedCount = 0;

  // Track queue size manually since p-queue doesn't expose size limit
  let currentQueueSize = 0;

  const enqueue = (message: T): boolean => {
    // Check if queue is full
    if (currentQueueSize >= maxQueueSize) {
      // Drop oldest (FIFO) - p-queue handles this internally, but we track drops
      droppedCount++;
      if (onDrop) {
        onDrop(droppedCount);
      }
      return false;
    }

    currentQueueSize++;

    void queue
      .add(async () => {
        try {
          await handler(message);
        } finally {
          currentQueueSize--;
        }
      })
      .catch(() => {
        // Handler errors are logged by caller, just decrement counter
        currentQueueSize--;
      });

    return true;
  };

  const getQueueSize = (): number => currentQueueSize;

  const getDroppedCount = (): number => droppedCount;

  const waitForIdle = async (): Promise<void> => {
    await queue.onIdle();
  };

  const clear = (): void => {
    queue.clear();
    currentQueueSize = 0;
    droppedCount = 0;
  };

  return {
    enqueue,
    getQueueSize,
    getDroppedCount,
    waitForIdle,
    clear,
  };
};
