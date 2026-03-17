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
          className="text-pink-500 hover:underline"
        >
          LUKSO
        </a>
      </p>
      <p className="text-label text-[10px] sm:text-xs">
        This app is in <span className="text-pink-500 font-bold">BETA</span>.{" "}
        <a
          href="https://github.com/JordyDutch/issue-tracker/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="text-pink-500 hover:text-pink-500 underline underline-offset-2 transition-colors"
        >
          Report issues to our team
        </a>
      </p>
    </footer>
  );
}
