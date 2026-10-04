import html from "../lib/noor-page.html?raw";
export function GET(){return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8"}});}
