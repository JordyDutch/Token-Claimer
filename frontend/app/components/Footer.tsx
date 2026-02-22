"use client";

export default function Footer() {
  return (
    <footer className="text-center py-6 px-4 space-y-1.5">
      <p className="text-faint text-[10px] sm:text-xs">
        Built on{" "}
        <a
          href="https://lukso.network"
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-400 hover:underline"
        >
          LUKSO
        </a>
      </p>
      <p className="text-label text-[10px] sm:text-xs">
        This app is in beta.{" "}
        <a
          href="https://github.com/JordyDutch/issue-tracker/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors"
        >
          Report issues to our team
        </a>
      </p>
    </footer>
  );
}
