
export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  quantityPurchased: number;
  quantitySold: number;
  price: number;
  supplier: string;
  datePurchased: string;
  dateShelved: string;
  imageUrl: string;
}

export interface ShopInfo {
  name: string;
  manager: string;
  workersCount: number;
}

export interface Transaction {
  id: string;
  productId: string;
  productName: string;
  type: 'PURCHASE' | 'SALE';
  quantity: number;
  priceAtTime: number;
  date: string;
  entity: string; // Supplier or Customer
}

export type ThemeMode = 'light' | 'dark';

export interface UserSettings {
  email: string;
  theme: ThemeMode;
  currency: string;
}
