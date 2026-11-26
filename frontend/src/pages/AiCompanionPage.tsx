import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Send, 
  Trash2, 
  Radio, 
  Dna, 
  Wrench, 
  Bot, 
  User, 
  Music,
  ArrowDown,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import { sendChatMessage, getChatHistory, clearChatHistory, sendFeedback } from '../api/client';
import type { ChatMessage } from '../types';
import { RichText } from '../components/RichText';

export const AiCompanionPage: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, 'like' | 'dislike'>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleFeedback = async (index: number, type: 'like' | 'dislike', content: string) => {
    try {
      setFeedbackGiven(prev => ({ ...prev, [index]: type }));
      await sendFeedback({
        feedbackType: type,
        context: content.slice(0, 150),
      });
    } catch (e) {
      console.error('Failed to send feedback:', e);
    }
  };

  const promptSuggestions = [
    "What does my Music DNA reveal about my personality?",
    "Recommend 5 hidden gems similar to my top artists",
    "Design a moody late-night driving playlist",
    "Which genres do I listen to the most right now?",
    "Find underrated tracks from artists in my saved library"
  ];

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadHistory = async () => {
    try {
      setInitialLoading(true);
      const res = await getChatHistory(30);
      setMessages(res.history || []);
    } catch (e) {
      console.error('Failed to load chat history:', e);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await sendChatMessage(text);
      const modelMsg: ChatMessage = {
        role: 'model',
        content: res.reply,
        toolsUsed: res.toolsUsed,
      };
      setMessages(prev => [...prev, modelMsg]);
    } catch (e: any) {
      console.error('Chat error:', e);
      const detail = e.response?.data?.message || e.message || 'Unknown error';
      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          content: `I encountered an issue communicating with the AI service: ${detail}. Please check your connection or try again in a moment.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (confirm('Clear chat conversation history?')) {
      await clearChatHistory();
      setMessages([]);
    }
  };

  return (
    <div className="h-[calc(100dvh-13rem)] lg:h-[calc(100dvh-8rem)] flex flex-col bg-glass backdrop-blur-2xl border border-white/5 rounded-[28px] overflow-hidden animate-fadeIn">
      {/* Chat Header */}
      <div className="p-4 sm:p-5 border-b border-white/5 bg-glass backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-green-400 flex items-center justify-center text-black shadow-lg shadow-emerald-500/20">
            <Sparkles className="w-5 h-5 text-black" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Gemini Music Companion</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                Gemini
              </span>
            </div>
            <div className="text-xs text-neutral-400">
              Directly connected to your Spotify library &amp; Music DNA
            </div>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="p-2 rounded-xl text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Clear Chat History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {initialLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto py-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <Radio className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">
              How can I curate for you today?
            </h3>
            <p className="text-xs text-neutral-400 mb-6">
              I have direct tools to query your top artists, tracks, and personalized taste metrics. Select a prompt or ask anything.
            </p>

            <div className="flex flex-col gap-2 w-full text-left">
              {promptSuggestions.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(prompt)}
                  className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 text-xs text-neutral-300 transition-colors text-left flex items-center justify-between group cursor-pointer"
                >
                  <span>{prompt}</span>
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex gap-3 max-w-3xl ${
                msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                  msg.role === 'user'
                    ? 'bg-neutral-800 text-neutral-200 border border-white/10'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble */}
              <div className="space-y-2 max-w-[85%]">
                {/* Tools Used Badge (if model called function tools) */}
                {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {msg.toolsUsed.map((tool, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-medium"
                      >
                        <Wrench className="w-2.5 h-2.5" />
                        <span>Called {tool}()</span>
                      </span>
                    ))}
                  </div>
                )}

                <div
                  className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    msg.role === 'user'
                      ? 'bg-emerald-500 text-black font-medium'
                      : 'bg-raised border border-white/5 text-neutral-200'
                  }`}
                >
                  {msg.role === 'model' ? <RichText text={msg.content} /> : msg.content}
                </div>

                {/* Feedback Reactions for Model Responses */}
                {msg.role === 'model' && (
                  <div className="flex items-center gap-2 pt-1 pl-1">
                    <button
                      onClick={() => handleFeedback(index, 'like', msg.content)}
                      className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                        feedbackGiven[index] === 'like'
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                      }`}
                      title="Train AI: I like this recommendation"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      {feedbackGiven[index] === 'like' && <span className="text-[10px] font-semibold">Saved</span>}
                    </button>
                    <button
                      onClick={() => handleFeedback(index, 'dislike', msg.content)}
                      className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                        feedbackGiven[index] === 'dislike'
                          ? 'text-rose-400 bg-rose-500/10'
                          : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                      }`}
                      title="Train AI: Don't recommend this style again"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      {feedbackGiven[index] === 'dislike' && <span className="text-[10px] font-semibold">Avoided</span>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex gap-3 max-w-3xl mr-auto">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-4 rounded-2xl bg-raised border border-white/5 text-xs text-neutral-400 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Analyzing listening data &amp; generating recommendation...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-4 bg-glass backdrop-blur-xl border-t border-white/5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your taste, request curated playlists, or discover hidden gems..."
            className="flex-1 bg-ink/60 border border-white/5 focus:border-emerald-500/50 rounded-2xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none transition-all"
            disabled={loading}
          />

          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold transition-all disabled:opacity-40 disabled:hover:bg-emerald-500 cursor-pointer flex-shrink-0"
          >
            <Send className="w-4 h-4 text-black" />
          </button>
        </form>
      </div>
    </div>
  );
};
