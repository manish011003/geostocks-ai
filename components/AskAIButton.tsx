"use client";

interface Props {
  onClick: () => void;
}

export default function AskAIButton({ onClick }: Props) {
  return (
    <button
      type="button"
      className="ask-ai-fab"
      onClick={onClick}
      aria-label="Open the GeoStock AI analyst"
    >
      <span className="pulse" />
      <span>ASK AI</span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
