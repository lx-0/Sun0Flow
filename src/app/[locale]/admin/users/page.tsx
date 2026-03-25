"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  MagnifyingGlassIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  isAdmin: boolean;
  isDisabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  generationCount: number;
}

type SortField = "createdAt" | "name" | "generationCount";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      search,
      sortBy,
      order,
      page: String(page),
      limit: "20",
    });
    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json();
    setUsers(data.users);
    setTotalPages(data.totalPages);
    setLoading(false);
  }, [search, sortBy, order, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setOrder("desc");
    }
    setPage(1);
  };

  const handleToggle = async (userId: string) => {
    setToggling(userId);
    await fetch(`/api/admin/users/${userId}/toggle`, { method: "POST" });
    await fetchUsers();
    setToggling(null);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return null;
    return order === "asc" ? (
      <ChevronUpIcon className="w-4 h-4 inline ml-1" />
    ) : (
      <ChevronDownIcon className="w-4 h-4 inline ml-1" />
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>

      <div className="relative max-w-md">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th
                  className="text-left px-4 py-3 cursor-pointer hover:text-white"
                  onClick={() => handleSort("name")}
                >
                  User <SortIcon field="name" />
                </th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Status</th>
                <th
                  className="text-left px-4 py-3 cursor-pointer hover:text-white"
                  onClick={() => handleSort("generationCount")}
                >
                  Generations <SortIcon field="generationCount" />
                </th>
                <th
                  className="text-left px-4 py-3 hidden md:table-cell cursor-pointer hover:text-white"
                  onClick={() => handleSort("createdAt")}
                >
                  Joined <SortIcon field="createdAt" />
                </th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="hover:text-violet-400 transition-colors"
                      >
                        <div className="font-medium">
                          {user.name || "Unnamed"}
                          {user.isAdmin && (
                            <span className="ml-2 text-xs bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded">
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="text-gray-500 text-xs">{user.email}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          user.isDisabled
                            ? "bg-red-900/30 text-red-400"
                            : "bg-green-900/30 text-green-400"
                        }`}
                      >
                        {user.isDisabled ? "Disabled" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{user.generationCount}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!user.isAdmin && (
                        <button
                          onClick={() => handleToggle(user.id)}
                          disabled={toggling === user.id}
                          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                            user.isDisabled
                              ? "bg-green-900/30 text-green-400 hover:bg-green-900/50"
                              : "bg-red-900/30 text-red-400 hover:bg-red-900/50"
                          } disabled:opacity-50`}
                        >
                          {toggling === user.id
                            ? "..."
                            : user.isDisabled
                            ? "Enable"
                            : "Disable"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
