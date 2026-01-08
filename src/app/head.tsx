import { STORAGE_KEYS } from "@/lib/storageKeys";

export default function Head() {
  // Default is light. If a stored preference exists, apply it before React hydrates.
  const code = `(function(){try{var raw=localStorage.getItem(${JSON.stringify(
    STORAGE_KEYS.theme,
  )});if(!raw)return;var parsed=JSON.parse(raw);var t=parsed&&parsed.theme;if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

