'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export default function Chat() {
  // 1. Наш надежный локальный стейт для ввода текста
  const [customInput, setCustomInput] = useState('');

  // 2. В свежих версиях SDK вместо append используется sendMessage; isLoading → status
  const { messages, sendMessage, status } = useChat();
  const isBusy = status === 'submitted' || status === 'streaming';

  // 3. Обработчик отправки формы
  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customInput.trim() || isBusy) return;

    // Сохраняем текст перед очисткой инпута
    const textToSend = customInput.trim();
    setCustomInput('');

    try {
      // 4. Используем новый синтаксис SDK для отправки
      await sendMessage({ text: textToSend });
    } catch (error) {
      console.error('Ошибка отправки сообщения:', error);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-2xl py-24 mx-auto stretch font-sans">
      <h1 className="text-2xl font-bold mb-6 text-center text-slate-800">
        AI Project Manager Framework 🚀
      </h1>

      {/* Зона вывода сообщений */}
      <div className="space-y-4 mb-8 min-h-[200px] border border-slate-100 rounded-xl p-4 bg-slate-50/50">
        {messages.length === 0 && (
          <p className="text-slate-400 text-center italic pt-12">
            Введите что-нибудь, чтобы проверить ИИ-петлю...
          </p>
        )}

        {messages.map(m => (
          <div
            key={m.id}
            className={`whitespace-pre-wrap p-3 rounded-lg max-w-[85%] ${
              m.role === 'user'
                ? 'bg-blue-600 text-white ml-auto'
                : 'bg-white text-slate-800 border border-slate-200'
            }`}
          >
            <span className="block text-xs font-semibold uppercase tracking-wider mb-1 opacity-60">
              {m.role === 'user' ? 'Вы' : 'ИИ-Агент'}
            </span>
            {m.parts.map((part, index) =>
              part.type === 'text' ? <span key={index}>{part.text}</span> : null,
            )}
          </div>
        ))}

        {isBusy && (
          <div className="text-xs text-slate-400 animate-pulse italic">
            Агент размышляет...
          </div>
        )}
      </div>

      {/* Форма ввода */}
      <form onSubmit={handleCustomSubmit} className="flex gap-2">
        <input
          className="flex-1 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
          value={customInput}
          placeholder="Скажи привет будущему менеджеру проектов..."
          onChange={(e) => setCustomInput(e.target.value)}
          disabled={isBusy}
        />
        <button
          type="submit"
          disabled={isBusy || !customInput.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          Отправить
        </button>
      </form>
    </div>
  );
}
