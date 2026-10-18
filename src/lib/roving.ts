/** Where an arrow key, Home or End moves a group's one tab stop (wrapping), or -1 for other keys. */
export function rovingTarget(key: string, index: number, count: number): number {
  const last = count - 1;
  return key === 'ArrowRight' ? (index === last ? 0 : index + 1)
    : key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
    : key === 'Home' ? 0
    : key === 'End' ? last
    : -1;
}
