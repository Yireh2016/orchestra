export const PM_ADAPTER = Symbol('PM_ADAPTER');

export interface Ticket {
  id: string;
  key: string;
  summary: string;
  description: string;
  status: string;
  assignee: string | null;
  labels: string[];
  priority: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketComment {
  id: string;
  author: string;
  body: string;
  createdAt: Date;
}

export interface TicketTransition {
  id: string;
  name: string;
  to: string;
}

export interface PMAdapter {
  getTicket(ticketId: string): Promise<Ticket>;
  updateTicket(
    ticketId: string,
    update: Partial<Pick<Ticket, 'summary' | 'description' | 'status' | 'assignee' | 'labels'>>,
  ): Promise<Ticket>;
  getComments(ticketId: string): Promise<TicketComment[]>;
  addComment(ticketId: string, body: string): Promise<TicketComment>;
  getTransitions(ticketId: string): Promise<TicketTransition[]>;
  transitionTicket(ticketId: string, transitionId: string): Promise<void>;
  searchTickets(query: string): Promise<Ticket[]>;
}
