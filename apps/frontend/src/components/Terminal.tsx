import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Socket } from 'socket.io-client';

interface Props {
  sessionId: string;
  socket: Socket;
}

export default function Terminal({ sessionId, socket }: Props) {
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
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    term.onData((data) => socket.emit('terminal:input', { sessionId, data }));
    term.onResize(({ cols, rows }) => socket.emit('terminal:resize', { sessionId, cols, rows }));

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(containerRef.current);

    // Replay buffered output
    socket.emit('session:join', { sessionId });

    return () => {
      ro.disconnect();
      term.dispose();
    };
  }, [sessionId, socket]);

  useEffect(() => {
    const handler = ({ sessionId: sid, data }: { sessionId: string; data: string }) => {
      if (sid === sessionId) termRef.current?.write(data);
    };
    socket.on('terminal:data', handler);
    return () => { socket.off('terminal:data', handler); };
  }, [sessionId, socket]);

  return <div ref={containerRef} className="h-full w-full" />;
}
