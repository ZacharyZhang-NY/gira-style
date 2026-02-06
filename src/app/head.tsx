import { STORAGE_KEYS } from "@/lib/storageKeys";

export default function Head() {
  // Default is light. If a stored preference exists, apply it before React hydrates.
  const code = `(function(){try{var raw=localStorage.getItem(${JSON.stringify(
    STORAGE_KEYS.theme,
  )});if(raw){var parsed=JSON.parse(raw);var t=parsed&&parsed.theme;if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t;}}}catch(e){}try{var path=location&&location.pathname;if(path==="/start"||path==="/start/"){var cold=localStorage.getItem(${JSON.stringify(
    STORAGE_KEYS.coldStart,
  )});if(cold){var parsedCold=JSON.parse(cold);var answers=parsedCold&&parsedCold.answers;if(answers){var q1=answers.q1;var q2=answers.q2;var q3=answers.q3;var q4=answers.q4;var q1Ok=Array.isArray(q1)?q1.length>0:typeof q1==="string"&&q1.trim().length>0;var q2Ok=Array.isArray(q2)?q2.length>0:typeof q2==="string"&&q2.trim().length>0;var q3Ok=Array.isArray(q3)?q3.length>0:typeof q3==="string"&&q3.trim().length>0;var q4Ok=typeof q4==="string"&&q4.trim().length>0;var ok=q1Ok&&q2Ok&&q3Ok&&q4Ok;if(ok){location.replace("/studio");}}}}}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
