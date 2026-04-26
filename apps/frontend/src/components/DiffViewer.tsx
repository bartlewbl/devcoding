import { useMemo } from 'react';
import { html as diff2html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import { useMediaQuery } from '../hooks/useMediaQuery';

export default function DiffViewer({ diff }: { diff: string }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const rendered = useMemo(() => {
    if (!diff) return '';
    return diff2html(diff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: isMobile ? 'line-by-line' : 'side-by-side',
      colorScheme: 'dark' as never,
    });
  }, [diff, isMobile]);

  if (!rendered) {
    return <p className="text-zinc-700 text-xs px-3 py-2">No diff to show</p>;
  }

  return (
    <div
      className="overflow-auto text-xs"
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}
