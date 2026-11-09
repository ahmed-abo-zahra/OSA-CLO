'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export const MAX_CART_ITEM_QUANTITY = 50;

export interface CartItem {
  productId: string;
  nameEn: string;
  nameAr?: string;
  price: number;
  imageUrl?: string;
  size: string;
  color?: string;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  isHydrated: boolean;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  addItem: (item: CartItem) => void;
  removeItem: (id: string, size: string, color?: string) => void;
  updateQty: (id: string, size: string, quantity: number, color?: string) => void;
  clearCart: () => void;
  total: number;
  count: number;
}

const Context = createContext<CartContextType | null>(null);
const STORAGE_KEY = 'aso-cart-v1';

const sameItem = (item: CartItem, id: string, size: string, color?: string) =>
  item.productId === id && item.size === size && (item.color ?? '') === (color ?? '');

function restoreCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const totals = new Map<string, number>();
  const restored: CartItem[] = [];

  for (const candidate of value) {
    if (
      !candidate ||
      typeof candidate.productId !== 'string' ||
      typeof candidate.nameEn !== 'string' ||
      typeof candidate.size !== 'string' ||
      !Number.isFinite(candidate.price) ||
      candidate.price < 0 ||
      !Number.isInteger(candidate.quantity) ||
      candidate.quantity < 1
    ) continue;

    const alreadyInCart = totals.get(candidate.productId) ?? 0;
    const quantity = Math.min(candidate.quantity, MAX_CART_ITEM_QUANTITY - alreadyInCart);
    if (quantity < 1) continue;
    totals.set(candidate.productId, alreadyInCart + quantity);

    // Ignore legacy ownership/inventory hints; the server validates live stock at checkout.
    const item: CartItem = {
      productId: candidate.productId,
      nameEn: candidate.nameEn,
      nameAr: typeof candidate.nameAr === 'string' ? candidate.nameAr : undefined,
      price: candidate.price,
      imageUrl: typeof candidate.imageUrl === 'string' ? candidate.imageUrl : undefined,
      size: candidate.size,
      color: typeof candidate.color === 'string' ? candidate.color : undefined,
      quantity,
    };
    restored.push(item);
  }

  return restored;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
      setItems(restoreCart(raw));
    } catch {
      setItems([]);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage may be disabled or full; checkout remains server-validated.
    }
  }, [items, isHydrated]);

  const addItem = useCallback((item: CartItem) => {
    if (!Number.isFinite(item.price) || !Number.isInteger(item.quantity) || item.quantity <= 0) return;

    setItems((current) => {
      const currentProductQuantity = current
        .filter((existing) => existing.productId === item.productId)
        .reduce((sum, existing) => sum + existing.quantity, 0);
      const allowedQuantity = Math.min(item.quantity, MAX_CART_ITEM_QUANTITY - currentProductQuantity);
      if (allowedQuantity < 1) return current;

      const existingItem = current.find((existing) => sameItem(existing, item.productId, item.size, item.color));
      if (existingItem) {
        return current.map((existing) => existing === existingItem
          ? { ...existing, quantity: existing.quantity + allowedQuantity }
          : existing);
      }
      return [...current, { ...item, quantity: allowedQuantity }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id: string, size: string, color?: string) => {
    setItems((current) => current.filter((item) => !sameItem(item, id, size, color)));
  }, []);

  const updateQty = useCallback((id: string, size: string, quantity: number, color?: string) => {
    if (!Number.isInteger(quantity)) return;
    if (quantity <= 0) {
      removeItem(id, size, color);
      return;
    }

    setItems((current) => {
      const currentItem = current.find((item) => sameItem(item, id, size, color));
      if (!currentItem) return current;
      const otherProductQuantity = current
        .filter((item) => item.productId === id && item !== currentItem)
        .reduce((sum, item) => sum + item.quantity, 0);
      const nextQuantity = Math.min(quantity, Math.max(1, MAX_CART_ITEM_QUANTITY - otherProductQuantity));
      return current.map((item) => item === currentItem ? { ...item, quantity: nextQuantity } : item);
    });
  }, [removeItem]);

  const clearCart = useCallback(() => setItems([]), []);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Context.Provider value={{
      items,
      isHydrated,
      isOpen,
      setIsOpen,
      addItem,
      removeItem,
      updateQty,
      clearCart,
      total,
      count,
    }}>
      {children}
    </Context.Provider>
  );
}

export function useCart() {
  const context = useContext(Context);
  if (!context) throw new Error('useCart requires CartProvider');
  return context;
}
