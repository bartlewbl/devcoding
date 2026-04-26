import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Socket } from 'socket.io-client';

interface Props {
  sessionId: string;
  socket: Socket;
  tab?: string;
  status?: string;
}

export default function Terminal({ sessionId, socket, tab, status }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#0a0a0a',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        brightBlack: '#666666',
      },
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      cursorBlink: true,
      scrollback: 10000,
      convertEol: false,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);

    // Small delay so layout is settled before measuring
    setTimeout(() => {
      fit.fit();
      const dims = fit.proposeDimensions();
      if (dims) socket.emit('terminal:resize', { sessionId, cols: dims.cols, rows: dims.rows });
    }, 50);

    termRef.current = term;
    fitRef.current = fit;

    term.onData((data) => socket.emit('terminal:input', { sessionId, data }));
    term.onResize(({ cols, rows }) => socket.emit('terminal:resize', { sessionId, cols, rows }));

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* ignore if disposed */ }
    });
    ro.observe(containerRef.current);

    socket.emit('session:join', { sessionId });

    return () => {
      ro.disconnect();
      term.dispose();
    };
  }, [sessionId, socket]);

  // Re-fit whenever this tab becomes visible
  useEffect(() => {
    if (tab !== 'terminal') return;
    setTimeout(() => {
      try {
        fitRef.current?.fit();
      } catch { /* ignore */ }
    }, 30);
  }, [tab]);

  useEffect(() => {
    const handler = ({ sessionId: sid, data }: { sessionId: string; data: string }) => {
      if (sid === sessionId) termRef.current?.write(data);
    };
    socket.on('terminal:data', handler);
    return () => { socket.off('terminal:data', handler); };
  }, [sessionId, socket]);

  return (
    <div className="h-full w-full relative">
      <div ref={containerRef} className="h-full w-full" />
      {status === 'stopped' && (
        <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="text-center">
            <div className="text-zinc-400 text-sm mb-1">Session stopped</div>
            <div className="text-zinc-500 text-xs">Press Start to resume</div>
          </div>
        </div>
      )}
    </div>
  );
}
