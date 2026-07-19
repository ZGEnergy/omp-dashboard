# replay-coordinator.ts

Owns ordered browser event replay delivery per socket/session. Cold, delta, and older finite replay frames are admitted incrementally and serialized behind the asynchronous drain so finite history does not prefill queue caps; suppressed or unbounded live traffic remains subject to event/byte overflow (1013). Request terminal frames and live replay barriers remain ordered, and `REPLAY_SEND_BACKPRESSURE` requeues the current item without treating temporary gateway pressure as overflow.
