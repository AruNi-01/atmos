'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { FileDiff } from 'lucide-react';
import { parsePatchFiles } from '@pierre/diffs';
import { PatchDiff } from '@pierre/diffs/react';
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockGroup,
  CodeBlockContent,
} from '@/shared/components/code-block/code-block';
import { CopyButton } from '@/shared/components/code-block/copy-button';

export { isMarkdownPatchCode } from './is-markdown-patch-code';

function isValidSingleFilePatch(patch: string): boolean {
  try {
    const parsed = parsePatchFiles(patch);
    return parsed.length === 1 && parsed[0].files.length === 1;
  } catch {
    return false;
  }
}

function PlainTextWithLineNumbers({ code }: { code: string }) {
  const lines = code.split('\n');

  return (
    <pre className="py-3">
      <code>
        {lines.map((line, idx) => (
          <span key={idx} className="line block px-3 py-0.5 text-[13px] leading-relaxed">
            {line || ' '}
          </span>
        ))}
      </code>
    </pre>
  );
}

function SafePatchDiff({ code, isDark }: { code: string; isDark: boolean }) {
  const isValid = React.useMemo(() => isValidSingleFilePatch(code), [code]);

  if (!isValid) {
    return <PlainTextWithLineNumbers code={code} />;
  }

  return (
    <PatchDiff
      patch={code}
      options={{
        theme: isDark ? 'pierre-dark' : 'pierre-light',
        diffStyle: 'unified',
        overflow: 'wrap',
        disableLineNumbers: false,
        disableFileHeader: true,
      }}
    />
  );
}

export function MarkdownPatchDiff({ code }: { code: string }) {
  const t = useTranslations("shared.markdownRenderer");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <CodeBlock className="my-4">
      <CodeBlockHeader>
        <CodeBlockGroup>
          <FileDiff className="size-4 shrink-0" />
          <span className="text-xs uppercase tracking-wider">{t("common.diff")}</span>
        </CodeBlockGroup>
        <CodeBlockGroup>
          <CopyButton content={code} />
        </CodeBlockGroup>
      </CodeBlockHeader>
      <CodeBlockContent className="!px-0">
        <SafePatchDiff code={code} isDark={!!isDark} />
      </CodeBlockContent>
    </CodeBlock>
  );
}
