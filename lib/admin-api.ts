// Helper function for making authenticated admin API calls
export async function adminFetch(url: string, options: RequestInit = {}) {
  const adminToken = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

  if (!adminToken) {
    throw new Error('Admin not authenticated');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
    ...options.headers,
  };

  const finalUrl = url.startsWith('/api') ? `/shop${url}` : url;
  const response = await fetch(finalUrl, {
    ...options,
    headers,
  });

  // If unauthorized, redirect to login
  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminEmail');
      window.location.href = '/shop/admin/login';
    }
    throw new Error('Unauthorized');
  }

  return response;
}

