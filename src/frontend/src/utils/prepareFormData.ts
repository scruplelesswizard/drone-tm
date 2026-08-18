/* eslint-disable no-nested-ternary */
export default function prepareFormData(data: Record<string, unknown>) {
  const formData = Object.entries(data).reduce(
    (obj, [key, value]) => ({
      ...obj,
      [key]:
        value instanceof File
          ? value
          : Array.isArray(value) || typeof value === 'object'
            ? JSON.stringify(value)
            : value,
    }),
    {},
  );
  const formDataObj = new FormData();
  Object.keys(formData).forEach(key => {
    // @ts-expect-error formData[key] is typed more broadly than FormData.append's string | Blob parameter
    formDataObj.append(key, formData[key]);
  });
  return formDataObj;
}
