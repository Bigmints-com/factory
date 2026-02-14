'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Bot,
  User,
  Save,
  Loader2,
  Sparkles,
  ShoppingCart,
  BookOpen,
  CheckSquare,
  Calendar,
  Copy,
  Check,
  X,
  FileText,
  Terminal,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface SpecChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSpecSaved: () => void;
}

const QUICK_PROMPTS = [
  {
    icon: ShoppingCart,
    text: 'E-commerce Store',
    prompt:
      'Generate a spec for an e-commerce store with products, categories, orders, and customer reviews.',
  },
  {
    icon: BookOpen,
    text: 'Blog Platform',
    prompt:
      'Generate a spec for a blog platform with posts, categories, comments, and author profiles.',
  },
  {
    icon: CheckSquare,
    text: 'Task Manager',
    prompt:
      'Generate a spec for a task management app with projects, tasks, subtasks, and team members.',
  },
  {
    icon: Calendar,
    text: 'Booking System',
    prompt:
      'Generate a spec for a booking and appointment system with services, availability slots, bookings, and customers.',
  },
];

export function SpecChat({ open, onOpenChange, onSpecSaved }: SpecChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 160) + 'px';
  };

  const handleSend = async (text?: string) => {
    const content = text || input.trim();
    if (!content || streaming) return;

    const userMsg: Message = { role: 'user', content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    if (inputRef.current) inputRef.current.style.height = 'auto';

    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages([...newMessages, assistantMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Chat request failed');
      }
      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              accumulated += parsed.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: accumulated };
                return updated;
              });
            }
          } catch {
            // Skip
          }
        }
      }
    } catch (err: any) {
      toast.error('Chat failed', { description: err.message });
      setMessages(newMessages);
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Extract YAML from the latest assistant message
  const extractYaml = (content: string): string | null => {
    const match = content.match(/```yaml\n([\s\S]*?)```/);
    if (match) return match[1].trim();
    
    // Fallback: If AI is still streaming and hasn't closed the block
    const partialMatch = content.match(/```yaml\n([\s\S]*)/);
    if (partialMatch) return partialMatch[1].trim();
    
    return null;
  };

  const extractName = (yaml: string): string => {
    const match = yaml.match(/name:\s*"([^"]+)"/);
    return match ? match[1] : 'Untitled App';
  };

  // Get the latest YAML from any assistant message
  const latestYaml = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        const yaml = extractYaml(messages[i].content);
        if (yaml) return yaml;
      }
    }
    return null;
  })();

  const handleSaveSpec = async () => {
    if (!latestYaml) {
      toast.error('No YAML spec found');
      return;
    }

    setSaving(true);
    const name = extractName(latestYaml);

    try {
      const res = await fetch('/api/specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content: latestYaml }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Spec saved!', { description: data.file });
        onSpecSaved();
        onOpenChange(false);
      } else {
        toast.error('Save failed', { description: data.error });
      }
    } catch {
      toast.error('Failed to save spec');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!latestYaml) return;
    await navigator.clipboard.writeText(latestYaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isEmpty = messages.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed inset-0 z-50 flex flex-col w-screen h-screen max-w-none m-0 rounded-none border-0 p-0 gap-0 overflow-hidden outline-none bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 translate-x-0 translate-y-0 sm:max-w-none top-0 left-0 [&>button]:hidden">
        {/* Top Header Section (inspired by dialog-11) */}
        <DialogHeader className="border-b px-6 py-4 mb-0 flex-row items-center justify-between space-y-0 h-16 shrink-0 bg-card/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center space-x-4">
            <div className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary/10 p-2.5">
              <Zap className="size-5 text-primary" aria-hidden={true} />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="text-base font-semibold tracking-tight">
                Spec Generator
              </DialogTitle>
              <p className="text-xs text-muted-foreground font-medium">
                AI and Humans building together
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {latestYaml && !streaming && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 text-xs font-semibold gap-2 border-primary/20 hover:bg-primary/5 hover:border-primary/40 transition-all"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy YAML'}
                </Button>
                <Button
                  size="sm"
                  className="h-9 px-4 text-xs font-semibold gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  onClick={handleSaveSpec}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save as Spec
                </Button>
              </>
            )}
            <Separator orientation="vertical" className="h-6 mx-2" />
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors" 
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Main Split Content Area */}
        <div className="flex flex-1 overflow-hidden relative">
          
          {/* Left Pane: Polished Chat Interface */}
          <div className="flex flex-col w-[35%] min-w-[380px] max-w-[500px] border-r bg-card/30 backdrop-blur-sm z-20">
            {/* Messages Scroll Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scrollbar-thin scrollbar-thumb-muted-foreground/10 hover:scrollbar-thumb-muted-foreground/20">
              {isEmpty ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-10">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary shadow-2xl shadow-primary/20 ring-4 ring-primary/5 transition-transform hover:scale-110">
                    <Bot className="h-10 w-10 text-primary-foreground" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold tracking-tight">What shall we build today?</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px]">
                      Describe your application logic, and I&#39;ll handle the architecture.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 w-full pt-4">
                    {QUICK_PROMPTS.map((prompt) => {
                      const IconComp = prompt.icon;
                      return (
                        <Button
                          key={prompt.text}
                          variant="outline"
                          className="group flex items-center justify-start gap-3 rounded-2xl px-4 py-6 text-sm h-auto border-dashed hover:border-primary/50 hover:bg-primary/5 transition-all text-left overflow-hidden relative"
                          onClick={() => handleSend(prompt.prompt)}
                        >
                          <div className="shrink-0 p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                            <IconComp className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <span className="font-semibold text-card-foreground">{prompt.text}</span>
                          <div className="absolute right-[-10px] top-[-10px] opacity-0 group-hover:opacity-10 transition-opacity">
                            <Zap className="h-16 w-16 text-primary" />
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {messages.map((msg, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300",
                        msg.role === 'assistant' ? "flex-row" : "flex-row-reverse"
                      )}
                    >
                      <Avatar className={cn(
                        "h-8 w-8 shrink-0 mt-0.5 border ring-2 ring-offset-2 ring-transparent",
                        msg.role === 'assistant' ? "ring-primary/10" : "ring-muted"
                      )}>
                        <AvatarFallback
                          className={cn(
                            'text-[10px] font-bold',
                            msg.role === 'assistant'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {msg.role === 'assistant' ? 'AI' : 'YOU'}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        "flex-1 flex flex-col min-w-0 group",
                        msg.role === 'user' ? "items-end text-right" : "items-start text-left"
                      )}>
                        <span className="text-[10px] font-bold text-muted-foreground/60 mb-2 uppercase tracking-widest px-1">
                          {msg.role === 'assistant' ? 'SaveADay Engine' : 'Architect'}
                        </span>
                        <div className={cn(
                          "max-w-[95%] text-sm rounded-2xl p-4 leading-relaxed",
                          msg.role === 'assistant' 
                            ? "bg-card border border-border/50 text-foreground shadow-sm"
                            : "bg-primary text-primary-foreground shadow-md shadow-primary/10"
                        )}>
                          {msg.role === 'assistant'
                            ? <div className="prose prose-sm dark:prose-invert max-w-none">{renderAssistantContent(msg.content)}</div>
                            : <p className="whitespace-pre-wrap">{msg.content}</p>
                          }
                          {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                            <div className="flex gap-1 mt-3 h-4 items-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-0" />
                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-150" />
                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-300" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Input Floating Wrapper */}
            <div className="p-6 shrink-0 bg-transparent relative z-30">
              <div className="relative flex flex-col rounded-3xl bg-card/80 backdrop-blur-xl border border-border/50 shadow-2xl ring-4 ring-primary/5 overflow-hidden transition-all focus-within:ring-primary/10 focus-within:border-primary/30">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask for features or data models..."
                  className="w-full border-0 p-4 min-h-[60px] max-h-[160px] outline-none text-sm leading-relaxed text-foreground resize-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent pr-14"
                  rows={1}
                  disabled={streaming}
                />
                <div className="flex items-center justify-between p-3 pt-0">
                  <div className="flex items-center gap-1.5 opacity-40 hover:opacity-100 transition-opacity">
                    <Terminal className="h-3 w-3" />
                    <span className="text-[10px] font-medium tracking-tight">YAML ENGINE v1.0</span>
                  </div>
                  <div className="absolute right-3 bottom-3">
                    <Button
                      size="icon"
                      className={cn(
                        'rounded-2xl h-9 w-9 p-0 shadow-lg transition-all',
                        input.trim()
                          ? 'bg-primary text-primary-foreground hover:scale-105 active:scale-95'
                          : 'bg-muted text-muted-foreground'
                      )}
                      disabled={!input.trim() || streaming}
                      onClick={() => handleSend()}
                    >
                      {streaming ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Pane: Live YAML Preview Editor Space */}
          <div className="flex flex-1 flex-col bg-slate-950 text-slate-300 relative overflow-hidden group/preview">
            
            {/* Header / Tab Bar */}
            <div className="h-12 border-b border-white/5 bg-slate-900/50 flex items-center px-6 justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 group cursor-default">
                  <FileText className="h-4 w-4 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
                  <span className="text-[11px] font-bold tracking-widest text-slate-400 group-hover:text-slate-200 transition-colors uppercase">
                    app_specification.yaml
                  </span>
                </div>
                <Separator orientation="vertical" className="h-4 bg-white/10" />
                <div className="flex gap-2">
                   <div className="size-2 rounded-full bg-slate-700" />
                   <div className="size-2 rounded-full bg-slate-700" />
                   <div className="size-2 rounded-full bg-slate-700" />
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {latestYaml && (
                   <div className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold tracking-tighter animate-pulse">
                     LIVE STREAMING
                   </div>
                )}
                <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded">
                   <Check className="h-3 w-3 text-emerald-500" /> YAML v1.2
                </div>
              </div>
            </div>

            {/* Preview Pane Content */}
            <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.03),transparent)]">
              {latestYaml ? (
                <div className="p-10 font-mono text-sm leading-relaxed selection:bg-emerald-500/30">
                  <pre className="relative z-10 whitespace-pre-wrap">
                    <code className="text-emerald-300/90">{latestYaml}</code>
                  </pre>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center gap-6 p-10">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse" />
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-[2.5rem] bg-slate-900 border border-white/5 shadow-2xl">
                      <Terminal className="h-10 w-10 text-emerald-400/20" />
                    </div>
                  </div>
                  <div className="space-y-2 relative">
                    <h4 className="text-slate-100 font-bold tracking-tight">Awaiting Architecture</h4>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-[320px]">
                      Your specifications will appear here in real-time as the AI constructs your application schema.
                    </p>
                  </div>
                  
                  {/* Decorative terminal lines */}
                  <div className="flex flex-col gap-2 opacity-5 mt-4">
                     <div className="w-64 h-2 bg-white rounded-full" />
                     <div className="w-48 h-2 bg-white rounded-full ml-8" />
                     <div className="w-56 h-2 bg-white rounded-full ml-4" />
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer Bar */}
            <div className="h-10 border-t border-white/5 bg-slate-900/80 shrink-0 px-6 flex items-center justify-between text-[10px] font-mono text-slate-500 uppercase tracking-widest">
               <div className="flex items-center gap-4">
                  <span>UTF-8</span>
                  <span>YAML Schema Validated</span>
               </div>
               <div className="flex items-center gap-4">
                  <span>Lines: {latestYaml?.split('\n').length || 0}</span>
                  <span>LF</span>
               </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Render assistant content — strip out YAML blocks (shown in preview pane)
function renderAssistantContent(content: string) {
  // Regex to match YAML code blocks including unfinished ones
  const parts = content.split(/(```yaml[\s\S]*?(?:```|$))/g);
  
  return parts.map((part, i) => {
    if (part.startsWith('```yaml')) {
      // Show a collapsed indicator instead of the full YAML in chat
      return (
        <div
          key={i}
          className="my-4 px-4 py-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-3 group transition-all hover:bg-emerald-500/10"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 shrink-0">
             <FileText className="h-4 w-4" />
          </div>
          <div className="flex flex-col gap-0.5">
             <span className="font-bold tracking-tight uppercase tracking-widest text-[9px]">Live Preview Active</span>
             <span className="font-medium opacity-80">YAML structure rendered in the editor panel →</span>
          </div>
          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
             <Check className="h-4 w-4" />
          </div>
        </div>
      );
    }
    
    // Regular text (prose)
    if (part.trim() === '') return null;
    return <p key={i} className="mb-4 last:mb-0">{part}</p>;
  });
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
      <line x1="9" y1="9" x2="10" y2="9" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}
