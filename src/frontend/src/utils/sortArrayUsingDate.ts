interface HasDateTime {
  dateTime: string | number | Date;
}

export default function sortByDatetime<T extends HasDateTime>(arr: T[]): T[] {
  // Create a shallow copy of the array to avoid modifying the original
  const arrCopy = [...arr];

  return arrCopy.sort((a, b) => {
    const dateA = new Date(a.dateTime);
    const dateB = new Date(b.dateTime);

    // Make sure both are valid Date objects
    if (Number.isNaN(dateA.getTime()) || Number.isNaN(dateB.getTime())) {
      return 0; // Avoid invalid date comparison
    }

    // Compare the Date objects by their time in milliseconds
    return dateA.getTime() - dateB.getTime();
  });
}
