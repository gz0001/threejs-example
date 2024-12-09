export const API_URL = import.meta.env.VITE_API_URL;

export const fetcher = async (url: string, options?: RequestInit) => {
  const res = await fetch(`${API_URL}${url}`, options);
  if (!res.ok) {
    throw new Error('An error occurred while fetching the data.');
  }
  const data = await res.json();
  return data;
};

export const post = async (url: string, body: any, useFormdata = false) => {
  const headers = new Headers();
  if (!useFormdata) headers.append('Content-Type', 'application/json');

  const res = await fetch(`${API_URL}${url}`, {
    method: 'POST',
    headers,
    body: useFormdata ? jsonToFormData(body) : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error('An error occurred while fetching the data.');
  }
  const data = await res.json();
  return data;
};

export const buildFormData = (formData: FormData, data: any, parentKey: any = null) => {
  if (
    data &&
    typeof data === 'object' &&
    !(data instanceof Date) &&
    !(data instanceof File) &&
    !(data instanceof Blob)
  ) {
    Object.keys(data).forEach((key) => {
      buildFormData(formData, data[key], parentKey ? `${parentKey}[${key}]` : key);
    });
  } else {
    const value = data == null ? '' : data;

    formData.append(parentKey, value);
  }
};

export const jsonToFormData = (data: any) => {
  const formData = new FormData();

  buildFormData(formData, data);
  console.log(formData);

  return formData;
};
