import React from 'react';
import type { BoardDetails, Climb } from '@/app/lib/types';

type ClimbViewSeoFragmentProps = {
  climb: Climb;
  boardDetails: BoardDetails;
};

/**
 * Server-rendered fragment that gives crawlers (and the brief pre-hydration
 * paint) a heading and metadata about the climb the /view/{uuid} route is
 * about, before the PlayViewDrawer hydrates and covers the viewport.
 *
 * Visually hidden via the standard sr-only pattern so it doesn't double up
 * with the drawer's own header once the page is interactive.
 */
export default function ClimbViewSeoFragment({ climb, boardDetails }: ClimbViewSeoFragmentProps) {
  const grade = climb.difficulty ?? '';
  const setter = climb.setter_username ?? '';
  const boardName = boardDetails.board_name;
  const layoutName = boardDetails.layout_name ?? '';
  const ascents = climb.ascensionist_count ?? 0;

  return (
    <section
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      <h1>
        {climb.name}
        {grade ? ` — ${grade}` : ''}
      </h1>
      <p>
        {boardName} {layoutName} climb
        {setter ? ` set by ${setter}` : ''}
        {ascents > 0 ? `. ${ascents} ascents logged.` : '.'}
      </p>
    </section>
  );
}
