export default function prepareQueryParam(
  queryParam: Record<string, unknown>,
) {
  return Object.entries(queryParam).reduce(
    (obj, [key, val]) => ({
      ...obj,
      [key]: Array.isArray(val) ? val.join(',') : val,
    }),
    {},
  );
}
