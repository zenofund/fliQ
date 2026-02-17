import Layout from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, ChevronLeft, Loader2, Check, CheckCheck, User, ArrowLeft } from "lucide-react";
import { Link, useRoute } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Message } from "@shared/schema";
import { format } from "date-fns";
import { io, Socket } from "socket.io-client";

export default function Messages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [match, params] = useRoute("/messages/:userId?");
  const activeUserId = params?.userId;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const { data: chatsData, isLoading: isLoadingChats } = useQuery<{ userId: string, userName: string, userAvatar: string | null, lastMessage: Message }[]>({
    queryKey: ["/api/messages/chats"],
    enabled: !!user
  });

  const chats = [...(chatsData || [])].sort((a, b) => 
    new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
  );

  const { data: messages, isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: [`/api/messages/${activeUserId}`],
    enabled: !!user && !!activeUserId
  });

  const { data: chatAllowed } = useQuery<{ allowed: boolean }>({
    queryKey: [`/api/messages/allowed/${activeUserId}`],
    enabled: !!user && !!activeUserId
  });

  useEffect(() => {
    if (!user) return;

    const newSocket = io(window.location.origin, {
      path: "/ws",
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ["websocket"],
    });

    newSocket.on("connect", () => {
      newSocket.emit("auth", { 
        type: "auth", 
        userId: user.id,
        activeChatId: activeUserId 
      });
    });

    newSocket.on("chat", (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/chats"] });
      if (data.message.senderId === activeUserId || data.message.receiverId === activeUserId) {
        queryClient.invalidateQueries({ queryKey: [`/api/messages/${activeUserId}`] });
      }
    });

    newSocket.on("chat_ack", (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/chats"] });
      if (data.message.senderId === activeUserId || data.message.receiverId === activeUserId) {
        queryClient.invalidateQueries({ queryKey: [`/api/messages/${activeUserId}`] });
      }
    });

    newSocket.on("messages_read", (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/chats"] });
      if (data.readerId === activeUserId) {
        queryClient.invalidateQueries({ queryKey: [`/api/messages/${activeUserId}`] });
      }
    });

    setSocket(newSocket);
    return () => {
      newSocket.disconnect();
    };
  }, [user, activeUserId, queryClient]);

  useEffect(() => {
    if (socket?.connected) {
      socket.emit("viewing_chat", {
        type: "viewing_chat",
        userId: user?.id,
        otherId: activeUserId
      });
    }
    
    return () => {
      if (socket?.connected) {
        socket.emit("viewing_chat", {
          type: "viewing_chat",
          userId: user?.id,
          otherId: null
        });
      }
    };
  }, [activeUserId, socket, user?.id]);

  useEffect(() => {
    if (messages && messages.length > 0) {
      if (isFirstLoad.current) {
        scrollToBottom("auto");
        isFirstLoad.current = false;
      } else {
        scrollToBottom("smooth");
      }
    }
  }, [messages]);

  // Reset first load when changing chat
  useEffect(() => {
    isFirstLoad.current = true;
  }, [activeUserId]);

  const sendMessage = () => {
    if (!socket?.connected || !inputValue.trim() || !activeUserId || !user) return;

    socket.emit("chat", {
      type: "chat",
      senderId: user.id,
      receiverId: activeUserId,
      content: inputValue
    });

    setInputValue("");
  };

  const activeChat = chats?.find(c => c.userId === activeUserId);

  return (
    <Layout hideFooter compact>
      <div className="max-w-6xl mx-auto space-y-4 mb-4">
        <Link href={user?.role === "ESCORT" ? "/escort-dashboard" : "/client-dashboard"}>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white -ml-2 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
      <div className="flex flex-col md:grid md:grid-cols-[300px_1fr] gap-4 md:gap-6 h-[calc(100vh-8rem)] md:h-[calc(100vh-12rem)]">
        {/* Sidebar */}
        <Card className={`border-white/5 bg-card/20 overflow-hidden md:flex flex-col ${activeUserId ? 'hidden' : 'flex'}`}>
          <div className="p-4 border-b border-white/5">
            <h2 className="font-semibold text-white">Messages</h2>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {isLoadingChats ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : chats?.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No conversations yet
              </div>
            ) : (
              chats?.map((chat) => (
                <Link key={chat.userId} href={`/messages/${chat.userId}`}>
                  <div className={`p-4 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors ${chat.userId === activeUserId ? 'bg-white/5 border-l-2 border-primary' : ''}`}>
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 shrink-0 bg-white/5 flex items-center justify-center">
                      {chat.userAvatar ? (
                        <img src={chat.userAvatar} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <h3 className="text-sm font-medium text-white truncate">{chat.userName}</h3>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(chat.lastMessage.createdAt), "HH:mm")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <p className={`text-xs truncate flex-1 ${!chat.lastMessage.isRead && chat.lastMessage.receiverId === user?.id ? 'text-white font-semibold' : 'text-muted-foreground'}`}>
                          {chat.lastMessage.content}
                        </p>
                        {chat.lastMessage.senderId === user?.id && (
                          <div className="shrink-0">
                            {chat.lastMessage.isRead ? (
                              <CheckCheck className="w-3 h-3 text-blue-400" />
                            ) : (
                              <Check className="w-3 h-3 text-muted-foreground/40" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* Chat Window */}
        <Card className={`border-white/5 bg-card/20 flex flex-col flex-1 h-full ${!activeUserId ? 'hidden md:flex' : 'flex'}`}>
          {activeUserId ? (
            <>
              <div className="p-3 md:p-4 border-b border-white/5 flex items-center gap-3">
                 <Link href="/messages">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground md:hidden">
                       <ChevronLeft className="w-5 h-5" />
                    </Button>
                 </Link>
                 <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border border-white/10 shrink-0 bg-white/5 flex items-center justify-center">
                    {activeChat?.userAvatar ? (
                       <img src={activeChat.userAvatar} className="w-full h-full object-cover" />
                    ) : (
                       <User className="w-5 h-5 text-muted-foreground/40" />
                    )}
                 </div>
                 <div>
                    <h2 className="font-medium text-white text-sm md:text-base leading-none">{activeChat?.userName || "Chat"}</h2>
                    <span className="text-[10px] text-green-400">Online</span>
                 </div>
              </div>
              
              <div className="flex-1 p-4 md:p-6 space-y-4 overflow-y-auto">
                {isLoadingMessages ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {messages?.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}>
                         <div className={`max-w-[85%] md:max-w-[70%] p-3 text-xs md:text-sm rounded-2xl ${
                           msg.senderId === user?.id 
                             ? 'bg-white text-black rounded-tr-none font-medium shadow-lg' 
                             : 'bg-secondary/50 text-white rounded-tl-none border border-white/5 shadow-md'
                         }`}>
                            {msg.content}
                            <div className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${msg.senderId === user?.id ? 'text-black/50' : 'text-white/40'}`}>
                              {format(new Date(msg.createdAt), "HH:mm")}
                              {msg.senderId === user?.id && (
                                <span className="ml-1">
                                  {msg.isRead ? (
                                    <CheckCheck className="w-3 h-3 text-blue-500" />
                                  ) : (
                                    <Check className="w-3 h-3" />
                                  )}
                                </span>
                              )}
                            </div>
                         </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <div className="p-3 md:p-4 border-t border-white/5 flex gap-2 bg-card/30">
                 {chatAllowed?.allowed ? (
                   <>
                     <Input 
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                      placeholder="Message..." 
                      className="bg-white/5 border-white/10 focus-visible:ring-0 h-10 md:h-11 text-sm rounded-full px-4" 
                     />
                     <Button 
                      onClick={sendMessage}
                      size="icon" 
                      className="bg-white text-black hover:bg-white/90 shrink-0 h-10 w-10 md:h-11 md:w-11 rounded-full"
                     >
                        <Send className="w-4 h-4" />
                     </Button>
                   </>
                 ) : (
                   <div className="w-full py-2 px-4 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center font-medium">
                     Messaging is deactivated. Chat is only available for active, paid bookings.
                   </div>
                 )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Send className="w-8 h-8 opacity-20" />
              </div>
              <h3 className="text-white font-medium mb-1">Your Messages</h3>
              <p className="text-xs max-w-[200px]">Select a conversation to start chatting with your companion.</p>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
