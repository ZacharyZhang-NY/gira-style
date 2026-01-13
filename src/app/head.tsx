import { STORAGE_KEYS } from "@/lib/storageKeys";

export default function Head() {
  // Default is light. If a stored preference exists, apply it before React hydrates.
  const code = `(function(){try{var raw=localStorage.getItem(${JSON.stringify(
    STORAGE_KEYS.theme,
  )});if(raw){var parsed=JSON.parse(raw);var t=parsed&&parsed.theme;if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t;}}}catch(e){}try{var path=location&&location.pathname;if(path==="/start"||path==="/start/"||path==="/"||path===""){var cold=localStorage.getItem(${JSON.stringify(
    STORAGE_KEYS.coldStart,
  )});if(cold){var parsedCold=JSON.parse(cold);var answers=parsedCold&&parsedCold.answers;if(answers){var q1=answers.q1;var q2=answers.q2;var q3=answers.q3;var ok=typeof q1==="string"&&q1.trim().length>0&&Array.isArray(q2)&&q2.length>0&&Array.isArray(q3)&&q3.length>0;if(ok){location.replace("/studio");}}}}}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
