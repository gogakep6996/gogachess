/** Минималистичная векторная иконка папки — замена эмодзи 📁/📂 для
 * современного вида. `open` слегка приподнимает «крышку» (для пустой/
 * неразобранной папки), `muted` — приглушённый вариант ("Без папки"). */
export function FolderIcon({ className, open }: { className?: string; open?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3.5 6.5c0-.83.67-1.5 1.5-1.5h4.13c.4 0 .78.16 1.06.44l1.06 1.06c.28.28.66.44 1.06.44H19c.83 0 1.5.67 1.5 1.5V17c0 .83-.67 1.5-1.5 1.5H5c-.83 0-1.5-.67-1.5-1.5V6.5Z"
        fill="currentColor"
        fillOpacity={open ? '0.16' : '0.22'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
