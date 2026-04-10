import React, { useEffect, useState } from "react";

export interface ToastMessage {
  id: number;
  text: string;
}

let nextId = 0;

/** Simple auto-dismiss toast container. */
export function Toast({ messages, onDismiss }: {
  messages: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {messages.map((msg) => (
        <ToastItem key={msg.id} message={msg} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ message, onDismiss }: {
  message: ToastMessage;
  onDismiss: (id: number) => void;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(message.id), 300);
    }, 3000);
    return () => clearTimeout(timer);
  }, [message.id, onDismiss]);

  return (
    <div
      className={`px-4 py-2 bg-red-900/90 text-red-200 text-sm rounded-lg shadow-lg border border-red-800 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {message.text}
    </div>
  );
}

/** Hook to manage toast messages. */
export function useToast() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const showToast = (text: string) => {
    const id = nextId++;
    setMessages((prev) => [...prev, { id, text }]);
  };

  const dismissToast = (id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  return { messages, showToast, dismissToast };
}
