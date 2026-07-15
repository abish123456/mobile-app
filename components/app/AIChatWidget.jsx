'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, SendHorizontal, Loader2, Bot, User, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I am your Sabols AI Assistant. How can I help you today?\n\nYou can ask me about:\n- **Wallet balance** or deposits\n- **Order status** or delivery timings\n- **Profile** details or addresses'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when messages list updates
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputValue;
    if (!text.trim() || isLoading) return;

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    if (!textToSend) setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('/shop/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: text }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.message || 'Sorry, I encountered an issue validating your session or processing the request. Please make sure you are logged in.'
          }
        ]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I cannot connect to the AI assistant right now. Please check if the backend service is running.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to format messages (rendering markdown-like bold **text** and bullet lists)
  const formatMessageContent = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    let insideList = false;
    const elements = [];

    lines.forEach((line, idx) => {
      const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
      
      // Parse bold segments
      const parts = (isBullet ? line.trim().replace(/^[-*]\s+/, '') : line).split(/(\*\*.*?\*\*)/g);
      const parsedText = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={pIdx} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
        }
        return part;
      });

      if (isBullet) {
        if (!insideList) {
          insideList = true;
        }
        elements.push(
          <li key={`bullet-${idx}`} className="ml-4 list-disc pl-1 mb-1 leading-relaxed">
            {parsedText}
          </li>
        );
      } else {
        if (insideList) {
          insideList = false;
        }
        if (line.trim() === '') {
          elements.push(<div key={`space-${idx}`} className="h-2" />);
        } else {
          elements.push(
            <p key={`p-${idx}`} className="leading-relaxed mb-1.5 last:mb-0">
              {parsedText}
            </p>
          );
        }
      }
    });

    return elements;
  };

  const suggestions = [
    'What is my wallet balance?',
    'Show my latest order',
    'What is my address?',
    'Cans in hand?'
  ];

  return (
    <div className="fixed bottom-0 right-0 z-50 pointer-events-none p-4 sm:p-6 w-full max-w-sm sm:max-w-md flex flex-col items-end">
      {/* Chat window pane */}
      {isOpen && (
        <div className="pointer-events-auto flex flex-col w-full h-[500px] max-h-[80vh] bg-[#fbfdfd]/95 backdrop-blur-md rounded-2xl border border-primary/20 shadow-2xl overflow-hidden transition-all duration-300 ease-in-out mb-4">
          {/* Header */}
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground shadow-sm">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-primary" />
              </div>
              <div className="flex flex-col items-start leading-tight">
                <span className="text-sm font-semibold flex items-center gap-1">
                  Sabols AI Assistant <Sparkles className="h-3 w-3 text-amber-300" />
                </span>
                <span className="text-[10px] text-primary-foreground/80">Support Bot • Online</span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-white/10 rounded-full transition-colors"
              aria-label="Close Chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-[#f3f7fb] to-[#fafcfd]">
            {messages.map((msg, index) => {
              const isAssistant = msg.role === 'assistant';
              return (
                <div
                  key={index}
                  className={cn(
                    'flex gap-2.5 max-w-[85%] items-start animate-in fade-in-50 duration-200',
                    isAssistant ? 'self-start' : 'self-end flex-row-reverse ml-auto'
                  )}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border',
                      isAssistant
                        ? 'bg-[#ffffff] text-primary border-primary/10'
                        : 'bg-primary text-primary-foreground border-transparent'
                    )}
                  >
                    {isAssistant ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                  <div
                    className={cn(
                      'rounded-2xl px-3.5 py-2.5 text-sm shadow-sm',
                      isAssistant
                        ? 'bg-white border border-primary/5 text-slate-800 rounded-tl-sm'
                        : 'bg-primary text-primary-foreground rounded-tr-sm'
                    )}
                  >
                    {formatMessageContent(msg.content)}
                  </div>
                </div>
              );
            })}
            
            {isLoading && (
              <div className="flex gap-2.5 max-w-[85%] items-start self-start">
                <div className="w-7 h-7 rounded-full bg-[#ffffff] text-primary border border-primary/10 flex items-center justify-center shadow-sm">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-white border border-primary/5 rounded-2xl rounded-tl-sm px-3.5 py-3 text-sm shadow-sm text-slate-500 flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  AI is thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested chips (show only if not loading) */}
          {!isLoading && (
            <div className="px-4 py-2 flex flex-wrap gap-1.5 bg-[#f3f7fb] border-t border-primary/5">
              {suggestions.map((text) => (
                <button
                  key={text}
                  onClick={() => handleSendMessage(text)}
                  className="text-xs bg-white text-primary border border-primary/15 hover:bg-primary/5 hover:border-primary/30 rounded-full px-2.5 py-1 transition-all cursor-pointer font-medium shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          {/* Input form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t border-primary/10 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask me anything..."
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary/50 text-slate-800 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="p-2 bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50 disabled:hover:bg-primary rounded-xl transition-all shadow-md active:scale-95"
              aria-label="Send Message"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'pointer-events-auto flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer z-50 border border-white/20',
          // Floating offset above BottomNav on mobile (bottom-20 is ~80px, avoiding the bottom nav bar height)
          isOpen 
            ? 'bg-rose-500 hover:bg-rose-600 text-white rotate-90' 
            : 'bg-primary hover:bg-primary/90 text-primary-foreground',
          // Offset position dynamically for mobile vs desktop
          'fixed bottom-20 right-4 sm:bottom-6 sm:right-6'
        )}
        aria-label="Open support chat"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6 animate-pulse" />}
      </button>
    </div>
  );
}
