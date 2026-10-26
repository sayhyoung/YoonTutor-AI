// 화면 공통 날짜 표기.
export function formatDateTime(iso: string) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}`;
}
