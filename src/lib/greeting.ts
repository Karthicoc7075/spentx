export function getFirstName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function getTimeAwareGreeting(firstName: string, date = new Date()) {
  const hour = date.getHours();
  const name = getFirstName(firstName);

  if (hour < 12) return `Good morning, ${name}.`;
  if (hour < 17) return `Good afternoon, ${name}.`;
  return `Good evening, ${name}.`;
}