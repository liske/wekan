const subManager = new SubsManager();
const { calculateIndexData, enableClickOnTouch } = Utils;

let cardColors;
Meteor.startup(() => {
  cardColors = Cards.simpleSchema()._schema.color.allowedValues;
});

BlazeComponent.extendComponent({
  mixins() {
    return [Mixins.InfiniteScrolling, Mixins.PerfectScrollbar];
  },

  calculateNextPeak() {
    const cardElement = this.find('.js-card-details');
    if (cardElement) {
      const altitude = cardElement.scrollHeight;
      this.callFirstWith(this, 'setNextPeak', altitude);
    }
  },

  reachNextPeak() {
    const activitiesComponent = this.childComponents('activities')[0];
    activitiesComponent.loadNextPage();
  },

  onCreated() {
    this.currentBoard = Boards.findOne(Session.get('currentBoard'));
    this.isLoaded = new ReactiveVar(false);
    const boardBody = this.parentComponent().parentComponent();
    //in Miniview parent is Board, not BoardBody.
    if (boardBody !== null) {
      boardBody.showOverlay.set(true);
      boardBody.mouseHasEnterCardDetails = false;
    }
    this.calculateNextPeak();

    Meteor.subscribe('unsaved-edits');
  },

  isWatching() {
    const card = this.currentData();
    return card.findWatcher(Meteor.userId());
  },

  hiddenSystemMessages() {
    return Meteor.user().hasHiddenSystemMessages();
  },

  canModifyCard() {
    return (
      Meteor.user() &&
      Meteor.user().isBoardMember() &&
      !Meteor.user().isCommentOnly()
    );
  },

  scrollParentContainer() {
    const cardPanelWidth = 510;
    const bodyBoardComponent = this.parentComponent().parentComponent();
    //On Mobile View Parent is Board, Not Board Body. I cant see how this funciton should work then.
    if (bodyBoardComponent === null) return;
    const $cardView = this.$(this.firstNode());
    const $cardContainer = bodyBoardComponent.$('.js-swimlanes');
    const cardContainerScroll = $cardContainer.scrollLeft();
    const cardContainerWidth = $cardContainer.width();

    const cardViewStart = $cardView.offset().left;
    const cardViewEnd = cardViewStart + cardPanelWidth;

    let offset = false;
    if (cardViewStart < 0) {
      offset = cardViewStart;
    } else if (cardViewEnd > cardContainerWidth) {
      offset = cardViewEnd - cardContainerWidth;
    }

    if (offset) {
      bodyBoardComponent.scrollLeft(cardContainerScroll + offset);
    }

    //Scroll top
    const cardViewStartTop = $cardView.offset().top;
    const cardContainerScrollTop = $cardContainer.scrollTop();

    let topOffset = false;
    if (cardViewStartTop !== 100) {
      topOffset = cardViewStartTop - 100;
    }
    if (topOffset !== false) {
      bodyBoardComponent.scrollTop(cardContainerScrollTop + topOffset);
    }
  },

  presentParentTask() {
    let result = this.currentBoard.presentParentTask;
    if (result === null || result === undefined) {
      result = 'no-parent';
    }
    return result;
  },

  linkForCard() {
    const card = this.currentData();
    let result = '#';
    if (card) {
      const board = Boards.findOne(card.boardId);
      if (board) {
        result = FlowRouter.url('card', {
          boardId: card.boardId,
          slug: board.slug,
          cardId: card._id,
        });
      }
    }
    return result;
  },

  onRendered() {
    if (Meteor.settings.public.CARD_OPENED_WEBHOOK_ENABLED) {
      // Send Webhook but not create Activities records ---
      const card = this.currentData();
      const userId = Meteor.userId();
      //console.log(`userId: ${userId}`);
      //console.log(`cardId: ${card._id}`);
      //console.log(`boardId: ${card.boardId}`);
      //console.log(`listId: ${card.listId}`);
      //console.log(`swimlaneId: ${card.swimlaneId}`);
      const params = {
        userId,
        cardId: card._id,
        boardId: card.boardId,
        listId: card.listId,
        user: Meteor.user().username,
        url: '',
      };
      //console.log('looking for integrations...');
      const integrations = Integrations.find({
        boardId: card.boardId,
        type: 'outgoing-webhooks',
        enabled: true,
        activities: { $in: ['CardDetailsRendered', 'all'] },
      }).fetch();
      //console.log(`Investigation length: ${integrations.length}`);
      if (integrations.length > 0) {
        Meteor.call('outgoingWebhooks', integrations, 'CardSelected', params);
      }
      //-------------
    }

    if (!Utils.isMiniScreen()) {
      Meteor.setTimeout(() => {
        $('.card-details').mCustomScrollbar({
          theme: 'minimal-dark',
          setWidth: false,
          setLeft: 0,
          scrollbarPosition: 'outside',
          mouseWheel: true,
        });
        this.scrollParentContainer();
      }, 500);
    }
    const $checklistsDom = this.$('.card-checklist-items');

    $checklistsDom.sortable({
      tolerance: 'pointer',
      helper: 'clone',
      handle: '.checklist-title',
      items: '.js-checklist',
      placeholder: 'checklist placeholder',
      distance: 7,
      start(evt, ui) {
        ui.placeholder.height(ui.helper.height());
        EscapeActions.executeUpTo('popup-close');
      },
      stop(evt, ui) {
        let prevChecklist = ui.item.prev('.js-checklist').get(0);
        if (prevChecklist) {
          prevChecklist = Blaze.getData(prevChecklist).checklist;
        }
        let nextChecklist = ui.item.next('.js-checklist').get(0);
        if (nextChecklist) {
          nextChecklist = Blaze.getData(nextChecklist).checklist;
        }
        const sortIndex = calculateIndexData(prevChecklist, nextChecklist, 1);

        $checklistsDom.sortable('cancel');
        const checklist = Blaze.getData(ui.item.get(0)).checklist;

        Checklists.update(checklist._id, {
          $set: {
            sort: sortIndex.base,
          },
        });
      },
    });

    // ugly touch event hotfix
    enableClickOnTouch('.card-checklist-items .js-checklist');

    const $subtasksDom = this.$('.card-subtasks-items');

    $subtasksDom.sortable({
      tolerance: 'pointer',
      helper: 'clone',
      handle: '.subtask-title',
      items: '.js-subtasks',
      placeholder: 'subtasks placeholder',
      distance: 7,
      start(evt, ui) {
        ui.placeholder.height(ui.helper.height());
        EscapeActions.executeUpTo('popup-close');
      },
      stop(evt, ui) {
        let prevChecklist = ui.item.prev('.js-subtasks').get(0);
        if (prevChecklist) {
          prevChecklist = Blaze.getData(prevChecklist).subtask;
        }
        let nextChecklist = ui.item.next('.js-subtasks').get(0);
        if (nextChecklist) {
          nextChecklist = Blaze.getData(nextChecklist).subtask;
        }
        const sortIndex = calculateIndexData(prevChecklist, nextChecklist, 1);

        $subtasksDom.sortable('cancel');
        const subtask = Blaze.getData(ui.item.get(0)).subtask;

        Subtasks.update(subtask._id, {
          $set: {
            subtaskSort: sortIndex.base,
          },
        });
      },
    });

    // ugly touch event hotfix
    enableClickOnTouch('.card-subtasks-items .js-subtasks');

    function userIsMember() {
      return Meteor.user() && Meteor.user().isBoardMember();
    }

    // Disable sorting if the current user is not a board member
    this.autorun(() => {
      if ($checklistsDom.data('sortable')) {
        $checklistsDom.sortable('option', 'disabled', !userIsMember());
      }
      if ($subtasksDom.data('sortable')) {
        $subtasksDom.sortable('option', 'disabled', !userIsMember());
      }
    });
  },

  onDestroyed() {
    const parentComponent = this.parentComponent().parentComponent();
    //on mobile view parent is Board, not board body.
    if (parentComponent === null) return;
    parentComponent.showOverlay.set(false);
  },

  events() {
    const events = {
      [`${CSSEvents.transitionend} .js-card-details`]() {
        this.isLoaded.set(true);
      },
      [`${CSSEvents.animationend} .js-card-details`]() {
        this.isLoaded.set(true);
      },
    };

    return [
      {
        ...events,
        'click .js-close-card-details'() {
          Utils.goBoardId(this.data().boardId);
        },
        'click .js-open-card-details-menu': Popup.open('cardDetailsActions'),
        'submit .js-card-description'(event) {
          event.preventDefault();
          const description = this.currentComponent().getValue();
          this.data().setDescription(description);
        },
        'submit .js-card-details-title'(event) {
          event.preventDefault();
          const title = this.currentComponent()
            .getValue()
            .trim();
          if (title) {
            this.data().setTitle(title);
          }
        },
        'submit .js-card-details-assigner'(event) {
          event.preventDefault();
          const assigner = this.currentComponent()
            .getValue()
            .trim();
          if (assigner) {
            this.data().setAssignedBy(assigner);
          }
        },
        'submit .js-card-details-requester'(event) {
          event.preventDefault();
          const requester = this.currentComponent()
            .getValue()
            .trim();
          if (requester) {
            this.data().setRequestedBy(requester);
          }
        },
        'click .js-member': Popup.open('cardMember'),
        'click .js-add-members': Popup.open('cardMembers'),
        'click .js-assignee': Popup.open('cardAssignee'),
        'click .js-add-assignees': Popup.open('cardAssignees'),
        'click .js-add-labels': Popup.open('cardLabels'),
        'click .js-received-date': Popup.open('editCardReceivedDate'),
        'click .js-start-date': Popup.open('editCardStartDate'),
        'click .js-due-date': Popup.open('editCardDueDate'),
        'click .js-end-date': Popup.open('editCardEndDate'),
        'mouseenter .js-card-details'() {
          const parentComponent = this.parentComponent().parentComponent();
          //on mobile view parent is Board, not BoardBody.
          if (parentComponent === null) return;
          parentComponent.showOverlay.set(true);
          parentComponent.mouseHasEnterCardDetails = true;
        },
        'mousedown .js-card-details'() {
          Session.set('cardDetailsIsDragging', false);
          Session.set('cardDetailsIsMouseDown', true);
        },
        'mousemove .js-card-details'() {
          if (Session.get('cardDetailsIsMouseDown')) {
            Session.set('cardDetailsIsDragging', true);
          }
        },
        'mouseup .js-card-details'() {
          Session.set('cardDetailsIsDragging', false);
          Session.set('cardDetailsIsMouseDown', false);
        },
        'click #toggleButton'() {
          Meteor.call('toggleSystemMessages');
        },
      },
    ];
  },
}).register('cardDetails');

Template.cardDetails.helpers({
  userData() {
    // We need to handle a special case for the search results provided by the
    // `matteodem:easy-search` package. Since these results gets published in a
    // separate collection, and not in the standard Meteor.Users collection as
    // expected, we use a component parameter ("property") to distinguish the
    // two cases.
    const userCollection = this.esSearch ? ESSearchResults : Users;
    return userCollection.findOne(this.userId, {
      fields: {
        profile: 1,
        username: 1,
      },
    });
  },

  memberType() {
    const user = Users.findOne(this.userId);
    return user && user.isBoardAdmin() ? 'admin' : 'normal';
  },

  presenceStatusClassName() {
    const user = Users.findOne(this.userId);
    const userPresence = presences.findOne({ userId: this.userId });
    if (user && user.isInvitedTo(Session.get('currentBoard'))) return 'pending';
    else if (!userPresence) return 'disconnected';
    else if (Session.equals('currentBoard', userPresence.state.currentBoardId))
      return 'active';
    else return 'idle';
  },
});

Template.userAvatarAssigneeInitials.helpers({
  initials() {
    const user = Users.findOne(this.userId);
    return user && user.getInitials();
  },

  viewPortWidth() {
    const user = Users.findOne(this.userId);
    return ((user && user.getInitials().length) || 1) * 12;
  },
});

// We extends the normal InlinedForm component to support UnsavedEdits draft
// feature.
(class extends InlinedForm {
  _getUnsavedEditKey() {
    return {
      fieldName: 'cardDescription',
      // XXX Recovering the currentCard identifier form a session variable is
      // fragile because this variable may change for instance if the route
      // change. We should use some component props instead.
      docId: Session.get('currentCard'),
    };
  }

  close(isReset = false) {
    if (this.isOpen.get() && !isReset) {
      const draft = this.getValue().trim();
      if (
        draft !== Cards.findOne(Session.get('currentCard')).getDescription()
      ) {
        UnsavedEdits.set(this._getUnsavedEditKey(), this.getValue());
      }
    }
    super.close();
  }

  reset() {
    UnsavedEdits.reset(this._getUnsavedEditKey());
    this.close(true);
  }

  events() {
    const parentEvents = InlinedForm.prototype.events()[0];
    return [
      {
        ...parentEvents,
        'click .js-close-inlined-form': this.reset,
      },
    ];
  }
}.register('inlinedCardDescription'));

Template.cardDetailsActionsPopup.helpers({
  isWatching() {
    return this.findWatcher(Meteor.userId());
  },

  canModifyCard() {
    return (
      Meteor.user() &&
      Meteor.user().isBoardMember() &&
      !Meteor.user().isCommentOnly()
    );
  },
});

Template.cardDetailsActionsPopup.events({
  'click .js-members': Popup.open('cardMembers'),
  'click .js-assignees': Popup.open('cardAssignees'),
  'click .js-labels': Popup.open('cardLabels'),
  'click .js-attachments': Popup.open('cardAttachments'),
  'click .js-custom-fields': Popup.open('cardCustomFields'),
  'click .js-received-date': Popup.open('editCardReceivedDate'),
  'click .js-start-date': Popup.open('editCardStartDate'),
  'click .js-due-date': Popup.open('editCardDueDate'),
  'click .js-end-date': Popup.open('editCardEndDate'),
  'click .js-spent-time': Popup.open('editCardSpentTime'),
  'click .js-move-card': Popup.open('moveCard'),
  'click .js-copy-card': Popup.open('copyCard'),
  'click .js-copy-checklist-cards': Popup.open('copyChecklistToManyCards'),
  'click .js-set-card-color': Popup.open('setCardColor'),
  'click .js-move-card-to-top'(event) {
    event.preventDefault();
    const minOrder = _.min(
      this.list()
        .cards(this.swimlaneId)
        .map(c => c.sort),
    );
    this.move(this.boardId, this.swimlaneId, this.listId, minOrder - 1);
  },
  'click .js-move-card-to-bottom'(event) {
    event.preventDefault();
    const maxOrder = _.max(
      this.list()
        .cards(this.swimlaneId)
        .map(c => c.sort),
    );
    this.move(this.boardId, this.swimlaneId, this.listId, maxOrder + 1);
  },
  'click .js-archive'(event) {
    event.preventDefault();
    this.archive();
    Popup.close();
  },
  'click .js-more': Popup.open('cardMore'),
  'click .js-toggle-watch-card'() {
    const currentCard = this;
    const level = currentCard.findWatcher(Meteor.userId()) ? null : 'watching';
    Meteor.call('watch', 'card', currentCard._id, level, (err, ret) => {
      if (!err && ret) Popup.close();
    });
  },
});

Template.editCardTitleForm.onRendered(function() {
  autosize(this.$('.js-edit-card-title'));
});

Template.editCardTitleForm.events({
  'keydown .js-edit-card-title'(event) {
    // If enter key was pressed, submit the data
    // Unless the shift key is also being pressed
    if (event.keyCode === 13 && !event.shiftKey) {
      $('.js-submit-edit-card-title-form').click();
    }
  },
});

Template.editCardRequesterForm.onRendered(function() {
  autosize(this.$('.js-edit-card-requester'));
});

Template.editCardRequesterForm.events({
  'keydown .js-edit-card-requester'(event) {
    // If enter key was pressed, submit the data
    if (event.keyCode === 13) {
      $('.js-submit-edit-card-requester-form').click();
    }
  },
});

Template.editCardAssignerForm.onRendered(function() {
  autosize(this.$('.js-edit-card-assigner'));
});

Template.editCardAssignerForm.events({
  'keydown .js-edit-card-assigner'(event) {
    // If enter key was pressed, submit the data
    if (event.keyCode === 13) {
      $('.js-submit-edit-card-assigner-form').click();
    }
  },
});

Template.moveCardPopup.events({
  'click .js-done'() {
    // XXX We should *not* get the currentCard from the global state, but
    // instead from a “component” state.
    const card = Cards.findOne(Session.get('currentCard'));
    const bSelect = $('.js-select-boards')[0];
    const boardId = bSelect.options[bSelect.selectedIndex].value;
    const lSelect = $('.js-select-lists')[0];
    const listId = lSelect.options[lSelect.selectedIndex].value;
    const slSelect = $('.js-select-swimlanes')[0];
    const swimlaneId = slSelect.options[slSelect.selectedIndex].value;
    card.move(boardId, swimlaneId, listId, 0);
    Popup.close();
  },
});
BlazeComponent.extendComponent({
  onCreated() {
    subManager.subscribe('board', Session.get('currentBoard'), false);
    this.selectedBoardId = new ReactiveVar(Session.get('currentBoard'));
  },

  boards() {
    const boards = Boards.find(
      {
        archived: false,
        'members.userId': Meteor.userId(),
        _id: { $ne: Meteor.user().getTemplatesBoardId() },
      },
      {
        sort: ['title'],
      },
    );
    return boards;
  },

  swimlanes() {
    const board = Boards.findOne(this.selectedBoardId.get());
    return board.swimlanes();
  },

  aBoardLists() {
    const board = Boards.findOne(this.selectedBoardId.get());
    return board.lists();
  },

  events() {
    return [
      {
        'change .js-select-boards'(event) {
          this.selectedBoardId.set($(event.currentTarget).val());
          subManager.subscribe('board', this.selectedBoardId.get(), false);
        },
      },
    ];
  },
}).register('boardsAndLists');

Template.copyCardPopup.events({
  'click .js-done'() {
    const card = Cards.findOne(Session.get('currentCard'));
    const lSelect = $('.js-select-lists')[0];
    listId = lSelect.options[lSelect.selectedIndex].value;
    const slSelect = $('.js-select-swimlanes')[0];
    const swimlaneId = slSelect.options[slSelect.selectedIndex].value;
    const bSelect = $('.js-select-boards')[0];
    const boardId = bSelect.options[bSelect.selectedIndex].value;
    const textarea = $('#copy-card-title');
    const title = textarea.val().trim();
    // insert new card to the bottom of new list
    card.sort = Lists.findOne(card.listId)
      .cards()
      .count();

    if (title) {
      card.title = title;
      card.coverId = '';
      const _id = card.copy(boardId, swimlaneId, listId);
      // In case the filter is active we need to add the newly inserted card in
      // the list of exceptions -- cards that are not filtered. Otherwise the
      // card will disappear instantly.
      // See https://github.com/wekan/wekan/issues/80
      Filter.addException(_id);

      Popup.close();
    }
  },
});

Template.copyChecklistToManyCardsPopup.events({
  'click .js-done'() {
    const card = Cards.findOne(Session.get('currentCard'));
    const oldId = card._id;
    card._id = null;
    const lSelect = $('.js-select-lists')[0];
    card.listId = lSelect.options[lSelect.selectedIndex].value;
    const slSelect = $('.js-select-swimlanes')[0];
    card.swimlaneId = slSelect.options[slSelect.selectedIndex].value;
    const bSelect = $('.js-select-boards')[0];
    card.boardId = bSelect.options[bSelect.selectedIndex].value;
    const textarea = $('#copy-card-title');
    const titleEntry = textarea.val().trim();
    // insert new card to the bottom of new list
    card.sort = Lists.findOne(card.listId)
      .cards()
      .count();

    if (titleEntry) {
      const titleList = JSON.parse(titleEntry);
      for (let i = 0; i < titleList.length; i++) {
        const obj = titleList[i];
        card.title = obj.title;
        card.description = obj.description;
        card.coverId = '';
        const _id = Cards.insert(card);
        // In case the filter is active we need to add the newly inserted card in
        // the list of exceptions -- cards that are not filtered. Otherwise the
        // card will disappear instantly.
        // See https://github.com/wekan/wekan/issues/80
        Filter.addException(_id);

        // copy checklists
        Checklists.find({ cardId: oldId }).forEach(ch => {
          ch.copy(_id);
        });

        // copy subtasks
        cursor = Cards.find({ parentId: oldId });
        cursor.forEach(function() {
          'use strict';
          const subtask = arguments[0];
          subtask.parentId = _id;
          subtask._id = null;
          /* const newSubtaskId = */ Cards.insert(subtask);
        });

        // copy card comments
        CardComments.find({ cardId: oldId }).forEach(cmt => {
          cmt.copy(_id);
        });
      }
      Popup.close();
    }
  },
});

BlazeComponent.extendComponent({
  onCreated() {
    this.currentCard = this.currentData();
    this.currentColor = new ReactiveVar(this.currentCard.color);
  },

  colors() {
    return cardColors.map(color => ({ color, name: '' }));
  },

  isSelected(color) {
    if (this.currentColor.get() === null) {
      return color === 'white';
    }
    return this.currentColor.get() === color;
  },

  events() {
    return [
      {
        'click .js-palette-color'() {
          this.currentColor.set(this.currentData().color);
        },
        'click .js-submit'() {
          this.currentCard.setColor(this.currentColor.get());
          Popup.close();
        },
        'click .js-remove-color'() {
          this.currentCard.setColor(null);
          Popup.close();
        },
      },
    ];
  },
}).register('setCardColorPopup');

BlazeComponent.extendComponent({
  onCreated() {
    this.currentCard = this.currentData();
    this.parentBoard = new ReactiveVar(null);
    this.parentCard = this.currentCard.parentCard();
    if (this.parentCard) {
      const list = $('.js-field-parent-card');
      list.val(this.parentCard._id);
      this.parentBoard.set(this.parentCard.board()._id);
    } else {
      this.parentBoard.set(null);
    }
  },

  boards() {
    const boards = Boards.find(
      {
        archived: false,
        'members.userId': Meteor.userId(),
        _id: {
          $ne: Meteor.user().getTemplatesBoardId(),
        },
      },
      {
        sort: ['title'],
      },
    );
    return boards;
  },

  cards() {
    const currentId = Session.get('currentCard');
    if (this.parentBoard.get()) {
      return Cards.find({
        boardId: this.parentBoard.get(),
        _id: { $ne: currentId },
      });
    } else {
      return [];
    }
  },

  isParentBoard() {
    const board = this.currentData();
    if (this.parentBoard.get()) {
      return board._id === this.parentBoard.get();
    }
    return false;
  },

  isParentCard() {
    const card = this.currentData();
    if (this.parentCard) {
      return card._id === this.parentCard;
    }
    return false;
  },

  setParentCardId(cardId) {
    if (cardId) {
      this.parentCard = Cards.findOne(cardId);
    } else {
      this.parentCard = null;
    }
    this.currentCard.setParentId(cardId);
  },

  events() {
    return [
      {
        'click .js-copy-card-link-to-clipboard'() {
          // Clipboard code from:
          // https://stackoverflow.com/questions/6300213/copy-selected-text-to-the-clipboard-without-using-flash-must-be-cross-browser
          const StringToCopyElement = document.getElementById('cardURL');
          StringToCopyElement.select();
          if (document.execCommand('copy')) {
            StringToCopyElement.blur();
          } else {
            document.getElementById('cardURL').selectionStart = 0;
            document.getElementById('cardURL').selectionEnd = 999;
            document.execCommand('copy');
            if (window.getSelection) {
              if (window.getSelection().empty) {
                // Chrome
                window.getSelection().empty();
              } else if (window.getSelection().removeAllRanges) {
                // Firefox
                window.getSelection().removeAllRanges();
              }
            } else if (document.selection) {
              // IE?
              document.selection.empty();
            }
          }
        },
        'click .js-delete': Popup.afterConfirm('cardDelete', function() {
          Popup.close();
          Cards.remove(this._id);
          Utils.goBoardId(this.boardId);
        }),
        'change .js-field-parent-board'(event) {
          const selection = $(event.currentTarget).val();
          const list = $('.js-field-parent-card');
          if (selection === 'none') {
            this.parentBoard.set(null);
          } else {
            subManager.subscribe('board', $(event.currentTarget).val(), false);
            this.parentBoard.set(selection);
            list.prop('disabled', false);
          }
          this.setParentCardId(null);
        },
        'change .js-field-parent-card'(event) {
          const selection = $(event.currentTarget).val();
          this.setParentCardId(selection);
        },
      },
    ];
  },
}).register('cardMorePopup');

// Close the card details pane by pressing escape
EscapeActions.register(
  'detailsPane',
  () => {
    if (Session.get('cardDetailsIsDragging')) {
      // Reset dragging status as the mouse landed outside the cardDetails template area and this will prevent a mousedown event from firing
      Session.set('cardDetailsIsDragging', false);
      Session.set('cardDetailsIsMouseDown', false);
    } else {
      // Prevent close card when the user is selecting text and moves the mouse cursor outside the card detail area
      Utils.goBoardId(Session.get('currentBoard'));
    }
  },
  () => {
    return !Session.equals('currentCard', null);
  },
  {
    noClickEscapeOn: '.js-card-details,.board-sidebar,#header',
  },
);

Template.cardAssigneesPopup.events({
  'click .js-select-assignee'(event) {
    const card = Cards.findOne(Session.get('currentCard'));
    const assigneeId = this.userId;
    card.toggleAssignee(assigneeId);
    event.preventDefault();
  },
});

Template.cardAssigneesPopup.helpers({
  isCardAssignee() {
    const card = Template.parentData();
    const cardAssignees = card.getAssignees();

    return _.contains(cardAssignees, this.userId);
  },

  user() {
    return Users.findOne(this.userId);
  },
});

Template.cardAssigneePopup.helpers({
  userData() {
    // We need to handle a special case for the search results provided by the
    // `matteodem:easy-search` package. Since these results gets published in a
    // separate collection, and not in the standard Meteor.Users collection as
    // expected, we use a component parameter ("property") to distinguish the
    // two cases.
    const userCollection = this.esSearch ? ESSearchResults : Users;
    return userCollection.findOne(this.userId, {
      fields: {
        profile: 1,
        username: 1,
      },
    });
  },

  memberType() {
    const user = Users.findOne(this.userId);
    return user && user.isBoardAdmin() ? 'admin' : 'normal';
  },

  presenceStatusClassName() {
    const user = Users.findOne(this.userId);
    const userPresence = presences.findOne({ userId: this.userId });
    if (user && user.isInvitedTo(Session.get('currentBoard'))) return 'pending';
    else if (!userPresence) return 'disconnected';
    else if (Session.equals('currentBoard', userPresence.state.currentBoardId))
      return 'active';
    else return 'idle';
  },

  isCardAssignee() {
    const card = Template.parentData();
    const cardAssignees = card.getAssignees();

    return _.contains(cardAssignees, this.userId);
  },

  user() {
    return Users.findOne(this.userId);
  },
});

Template.cardAssigneePopup.events({
  'click .js-remove-assignee'() {
    Cards.findOne(this.cardId).unassignAssignee(this.userId);
    Popup.close();
  },
  'click .js-edit-profile': Popup.open('editProfile'),
});
