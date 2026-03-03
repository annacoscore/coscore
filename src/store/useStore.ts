"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { User, Review, FavoriteList } from "@/types";
import { reviews as initialReviews } from "@/data/reviews";

const DEFAULT_LIST_ID = "default";

function makeDefaultList(extras: string[] = []): FavoriteList {
  return {
    id: DEFAULT_LIST_ID,
    name: "Todos os Favoritos",
    productIds: extras,
    createdAt: new Date().toISOString().split("T")[0],
    isDefault: true,
  };
}

interface StoreState {
  currentUser: User | null;
  reviews: Review[];
  isLoginModalOpen: boolean;
  loginRedirectMessage: string;

  login: (email: string, password: string) => boolean;
  register: (name: string, email: string, password: string) => boolean;
  logout: () => void;

  // Favorite lists
  getUserLists: () => FavoriteList[];
  isFavorite: (productId: string) => boolean;
  isInList: (productId: string, listId: string) => boolean;
  getAllFavoriteIds: () => string[];
  toggleFavorite: (productId: string) => void;
  addToList: (productId: string, listId: string) => void;
  removeFromList: (productId: string, listId: string) => void;
  createList: (name: string) => FavoriteList | null;
  deleteList: (listId: string) => void;
  renameList: (listId: string, name: string) => void;

  // Reviews
  addReview: (review: Omit<Review, "id" | "createdAt" | "helpful">) => void;
  getProductReviews: (productId: string) => Review[];

  // Modal
  openLoginModal: (message?: string) => void;
  closeLoginModal: () => void;
}

const mockUsers: Record<string, { password: string; user: User }> = {
  "julia@coscore.com": {
    password: "123456",
    user: {
      id: "u001",
      name: "Julia Ferreira",
      email: "julia@coscore.com",
      favoriteLists: [
        {
          id: DEFAULT_LIST_ID,
          name: "Todos os Favoritos",
          productIds: ["p005", "p003", "p008"],
          createdAt: "2024-03-10",
          isDefault: true,
        },
        {
          id: "list-skincare",
          name: "Skincare",
          productIds: ["p006", "p009"],
          createdAt: "2024-05-01",
        },
        {
          id: "list-quero",
          name: "Quero Comprar",
          productIds: ["p004", "p007"],
          createdAt: "2024-07-15",
        },
      ],
      reviewCount: 2,
      joinedAt: "2024-03-10",
    },
  },
};

function updateLists(user: User, updater: (lists: FavoriteList[]) => FavoriteList[]): User {
  return { ...user, favoriteLists: updater(user.favoriteLists) };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      reviews: initialReviews,
      isLoginModalOpen: false,
      loginRedirectMessage: "",

      login: (email, password) => {
        const entry = mockUsers[email.toLowerCase()];
        if (entry && entry.password === password) {
          set({ currentUser: entry.user, isLoginModalOpen: false });
          return true;
        }
        return false;
      },

      register: (name, email, password) => {
        if (mockUsers[email.toLowerCase()]) return false;
        const newUser: User = {
          id: `u_${Date.now()}`,
          name,
          email,
          favoriteLists: [makeDefaultList()],
          reviewCount: 0,
          joinedAt: new Date().toISOString().split("T")[0],
        };
        mockUsers[email.toLowerCase()] = { password, user: newUser };
        set({ currentUser: newUser, isLoginModalOpen: false });
        return true;
      },

      logout: () => set({ currentUser: null }),

      getUserLists: () => {
        const { currentUser } = get();
        if (!currentUser) return [];
        // Ensure default list always exists
        const hasDefault = currentUser.favoriteLists.some((l) => l.isDefault);
        if (!hasDefault) {
          return [makeDefaultList(), ...currentUser.favoriteLists];
        }
        return currentUser.favoriteLists;
      },

      isFavorite: (productId) => {
        const { currentUser } = get();
        if (!currentUser) return false;
        return currentUser.favoriteLists.some((l) => l.productIds.includes(productId));
      },

      isInList: (productId, listId) => {
        const { currentUser } = get();
        if (!currentUser) return false;
        const list = currentUser.favoriteLists.find((l) => l.id === listId);
        return list?.productIds.includes(productId) ?? false;
      },

      getAllFavoriteIds: () => {
        const { currentUser } = get();
        if (!currentUser) return [];
        const all = currentUser.favoriteLists.flatMap((l) => l.productIds);
        return [...new Set(all)];
      },

      toggleFavorite: (productId) => {
        const { currentUser, isFavorite } = get();
        if (!currentUser) return;
        const already = isFavorite(productId);
        set({
          currentUser: updateLists(currentUser, (lists) => {
            const defaultList = lists.find((l) => l.isDefault) ?? makeDefaultList();
            if (already) {
              // Remove from all lists
              return lists.map((l) => ({
                ...l,
                productIds: l.productIds.filter((id) => id !== productId),
              }));
            } else {
              // Add to default list
              if (!lists.find((l) => l.isDefault)) {
                return [{ ...defaultList, productIds: [...defaultList.productIds, productId] }, ...lists];
              }
              return lists.map((l) =>
                l.isDefault
                  ? { ...l, productIds: l.productIds.includes(productId) ? l.productIds : [...l.productIds, productId] }
                  : l
              );
            }
          }),
        });
      },

      addToList: (productId, listId) => {
        const { currentUser } = get();
        if (!currentUser) return;
        set({
          currentUser: updateLists(currentUser, (lists) =>
            lists.map((l) =>
              l.id === listId && !l.productIds.includes(productId)
                ? { ...l, productIds: [...l.productIds, productId] }
                : l
            )
          ),
        });
      },

      removeFromList: (productId, listId) => {
        const { currentUser } = get();
        if (!currentUser) return;
        set({
          currentUser: updateLists(currentUser, (lists) =>
            lists.map((l) =>
              l.id === listId ? { ...l, productIds: l.productIds.filter((id) => id !== productId) } : l
            )
          ),
        });
      },

      createList: (name) => {
        const { currentUser } = get();
        if (!currentUser || !name.trim()) return null;
        const newList: FavoriteList = {
          id: `list_${Date.now()}`,
          name: name.trim(),
          productIds: [],
          createdAt: new Date().toISOString().split("T")[0],
        };
        set({
          currentUser: updateLists(currentUser, (lists) => [...lists, newList]),
        });
        return newList;
      },

      deleteList: (listId) => {
        const { currentUser } = get();
        if (!currentUser) return;
        set({
          currentUser: updateLists(currentUser, (lists) =>
            lists.filter((l) => l.id !== listId && !l.isDefault || l.id !== listId)
              .filter((l) => !(l.id === listId))
          ),
        });
      },

      renameList: (listId, name) => {
        const { currentUser } = get();
        if (!currentUser || !name.trim()) return;
        set({
          currentUser: updateLists(currentUser, (lists) =>
            lists.map((l) => (l.id === listId ? { ...l, name: name.trim() } : l))
          ),
        });
      },

      addReview: (reviewData) => {
        const newReview: Review = {
          ...reviewData,
          id: `r_${Date.now()}`,
          createdAt: new Date().toISOString().split("T")[0],
          helpful: 0,
        };
        set((state) => ({
          reviews: [newReview, ...state.reviews],
          currentUser: state.currentUser
            ? { ...state.currentUser, reviewCount: state.currentUser.reviewCount + 1 }
            : null,
        }));
      },

      getProductReviews: (productId) => {
        return get().reviews.filter((r) => r.productId === productId);
      },

      openLoginModal: (message = "") => {
        set({ isLoginModalOpen: true, loginRedirectMessage: message });
      },

      closeLoginModal: () => set({ isLoginModalOpen: false, loginRedirectMessage: "" }),
    }),
    {
      name: "coscore-storage",
      partialize: (state) => ({
        currentUser: state.currentUser,
        reviews: state.reviews,
      }),
    }
  )
);
